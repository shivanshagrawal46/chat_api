const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const auth = require('../middleware/auth');
const Message = require('../models/Message');
const { OAuth2Client } = require('google-auth-library');

// Helper function to decode JWT without verification (for debugging)
const decodeJWTWithoutVerification = (token) => {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { error: 'Invalid JWT structure: must have 3 parts separated by dots' };
        }
        
        const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
        
        return {
            header,
            payload,
            signature: parts[2].substring(0, 20) + '...' + parts[2].substring(parts[2].length - 20),
            isValidStructure: true
        };
    } catch (error) {
        return {
            error: error.message,
            isValidStructure: false
        };
    }
};

// Helper function for structured logging
const logGoogleSignIn = (level, message, data = {}) => {
    const timestamp = new Date().toISOString();
    const logData = {
        timestamp,
        level,
        service: 'GoogleSignIn',
        message,
        ...data
    };
    
    if (level === 'ERROR') {
        console.error(`[${timestamp}] [${level}] ${message}`, JSON.stringify(logData, null, 2));
    } else if (level === 'WARN') {
        console.warn(`[${timestamp}] [${level}] ${message}`, JSON.stringify(logData, null, 2));
    } else {
        console.log(`[${timestamp}] [${level}] ${message}`, JSON.stringify(logData, null, 2));
    }
};

// Validate environment configuration
const validateGoogleConfig = () => {
    const issues = [];
    const warnings = [];
    
    if (!process.env.GOOGLE_WEB_CLIENT_ID) {
        warnings.push('GOOGLE_WEB_CLIENT_ID not set in environment, using default');
    } else if (!process.env.GOOGLE_WEB_CLIENT_ID.includes('.apps.googleusercontent.com')) {
        issues.push('GOOGLE_WEB_CLIENT_ID format appears invalid (should contain .apps.googleusercontent.com)');
    }
    
    if (!process.env.GOOGLE_ANDROID_CLIENT_ID) {
        warnings.push('GOOGLE_ANDROID_CLIENT_ID not set in environment, using default');
    }
    
    if (!process.env.JWT_SECRET) {
        issues.push('JWT_SECRET not set in environment - JWT generation will fail');
    }
    
    if (!process.env.MONGODB_URI) {
        issues.push('MONGODB_URI not set in environment - database operations will fail');
    }
    
    return { issues, warnings };
};

// Get Google Client IDs from environment
const WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID || '54116343950-vq0kf8eiq6eikv8oig50j8eld54oou1q.apps.googleusercontent.com';
const ANDROID_CLIENT_ID = process.env.GOOGLE_ANDROID_CLIENT_ID || 'rzp_test_aE4kYli12TObHZ'; // Replace with your actual Android client ID if needed

// Validate and log configuration on startup
const configValidation = validateGoogleConfig();
logGoogleSignIn('INFO', 'Google Sign-In Configuration', {
    hasWebClientId: !!process.env.GOOGLE_WEB_CLIENT_ID,
    hasAndroidClientId: !!process.env.GOOGLE_ANDROID_CLIENT_ID,
    webClientIdPrefix: WEB_CLIENT_ID.substring(0, 30) + '...',
    webClientIdSuffix: '...' + WEB_CLIENT_ID.substring(WEB_CLIENT_ID.length - 10),
    webClientIdLength: WEB_CLIENT_ID.length,
    androidClientIdPrefix: ANDROID_CLIENT_ID.substring(0, 30) + '...',
    androidClientIdLength: ANDROID_CLIENT_ID.length,
    nodeEnv: process.env.NODE_ENV || 'development',
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasMongoUri: !!process.env.MONGODB_URI,
    configIssues: configValidation.issues,
    configWarnings: configValidation.warnings
});

if (configValidation.issues.length > 0) {
    logGoogleSignIn('ERROR', 'Configuration Issues Detected', {
        issues: configValidation.issues
    });
}

if (configValidation.warnings.length > 0) {
    logGoogleSignIn('WARN', 'Configuration Warnings', {
        warnings: configValidation.warnings
    });
}

const client = new OAuth2Client();

// Register new user
router.post('/register', async (req, res) => {
    try {
        const { firstName, lastName, email, phone, password, confirmPassword } = req.body;
        if (!firstName || !lastName || !email || !phone || !password || !confirmPassword) {
            return res.status(400).json({ error: 'All fields are required.' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Passwords do not match.' });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered.' });
        }
        const user = new User({ firstName, lastName, email, phone, password });
        await user.save();
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.status(201).json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Login user
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }
        const user = await User.findOne({ email });
        if (!user || !(await user.comparePassword(password))) {
            throw new Error('Invalid login credentials');
        }
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                phone: user.phone,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Google login (new robust version)
router.post('/google', async (req, res) => {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const startTime = Date.now();
    const stepTimings = {};
    
    try {
        // Enhanced request logging
        const requestStartTime = Date.now();
        logGoogleSignIn('INFO', 'Google Sign-In Request Received', {
            requestId,
            method: req.method,
            url: req.url,
            path: req.path,
            ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown',
            ips: req.ips,
            protocol: req.protocol,
            secure: req.secure,
            hostname: req.hostname,
            headers: {
                'user-agent': req.get('user-agent'),
                'content-type': req.get('content-type'),
                'content-length': req.get('content-length'),
                'origin': req.get('origin'),
                'referer': req.get('referer'),
                'accept': req.get('accept'),
                'accept-language': req.get('accept-language')
            },
            hasBody: !!req.body,
            bodyKeys: req.body ? Object.keys(req.body) : [],
            bodySize: req.body ? JSON.stringify(req.body).length : 0,
            rawBodyType: typeof req.body,
            timestamp: new Date().toISOString()
        });
        stepTimings.requestReceived = Date.now() - requestStartTime;

        // Step 1: Validate request body
        const validationStartTime = Date.now();
        const { idToken } = req.body;
        
        if (!idToken) {
            logGoogleSignIn('WARN', 'Google Sign-In Failed: No ID Token', {
                requestId,
                bodyKeys: req.body ? Object.keys(req.body) : [],
                bodyLength: req.body ? JSON.stringify(req.body).length : 0,
                bodyType: typeof req.body,
                bodyString: req.body ? JSON.stringify(req.body).substring(0, 200) : 'null',
                contentType: req.get('content-type'),
                possibleIssues: [
                    'Client not sending idToken in request body',
                    'Request body not being parsed correctly',
                    'Client sending token with different key name'
                ]
            });
            return res.status(400).json({ 
                error: 'No ID token provided',
                requestId,
                timestamp: new Date().toISOString(),
                debug: {
                    receivedKeys: req.body ? Object.keys(req.body) : [],
                    contentType: req.get('content-type')
                }
            });
        }
        stepTimings.validation = Date.now() - validationStartTime;

        // Step 1.5: Analyze token structure before verification
        const tokenAnalysisStartTime = Date.now();
        logGoogleSignIn('INFO', 'ID Token Received - Analyzing Structure', {
            requestId,
            tokenLength: idToken.length,
            tokenType: typeof idToken,
            tokenPrefix: idToken.substring(0, 30) + '...',
            tokenSuffix: '...' + idToken.substring(idToken.length - 30),
            hasSpaces: idToken.includes(' '),
            hasNewlines: idToken.includes('\n'),
            partsCount: idToken.split('.').length,
            startsWithBearer: idToken.startsWith('Bearer '),
            startsWithToken: idToken.startsWith('token ')
        });

        // Clean token if it has "Bearer " prefix
        let cleanToken = idToken;
        if (idToken.startsWith('Bearer ')) {
            cleanToken = idToken.replace(/^Bearer\s+/i, '');
            logGoogleSignIn('WARN', 'Token Had Bearer Prefix - Removed', {
                requestId,
                originalLength: idToken.length,
                cleanedLength: cleanToken.length
            });
        }

        // Decode token without verification to inspect structure
        const decodedToken = decodeJWTWithoutVerification(cleanToken);
        logGoogleSignIn('INFO', 'ID Token Structure Analysis', {
            requestId,
            isValidStructure: decodedToken.isValidStructure,
            hasError: !!decodedToken.error,
            error: decodedToken.error,
            header: decodedToken.header,
            payload: decodedToken.payload ? {
                iss: decodedToken.payload.iss,
                aud: decodedToken.payload.aud,
                sub: decodedToken.payload.sub,
                email: decodedToken.payload.email,
                email_verified: decodedToken.payload.email_verified,
                exp: decodedToken.payload.exp,
                iat: decodedToken.payload.iat,
                expDate: decodedToken.payload.exp ? new Date(decodedToken.payload.exp * 1000).toISOString() : null,
                iatDate: decodedToken.payload.iat ? new Date(decodedToken.payload.iat * 1000).toISOString() : null,
                isExpired: decodedToken.payload.exp ? (Date.now() / 1000) > decodedToken.payload.exp : null,
                timeUntilExpiry: decodedToken.payload.exp ? (decodedToken.payload.exp - (Date.now() / 1000)) : null,
                audMatchesWeb: decodedToken.payload.aud === WEB_CLIENT_ID,
                audMatchesAndroid: decodedToken.payload.aud === ANDROID_CLIENT_ID,
                audInList: decodedToken.payload.aud ? [WEB_CLIENT_ID, ANDROID_CLIENT_ID].includes(decodedToken.payload.aud) : false,
                allPayloadKeys: decodedToken.payload ? Object.keys(decodedToken.payload) : []
            } : null,
            signaturePreview: decodedToken.signature
        });

        // Check if token is expired based on decoded payload
        if (decodedToken.payload && decodedToken.payload.exp) {
            const isExpired = (Date.now() / 1000) > decodedToken.payload.exp;
            if (isExpired) {
                logGoogleSignIn('WARN', 'Token Appears Expired (Based on Decoded Payload)', {
                    requestId,
                    exp: decodedToken.payload.exp,
                    expDate: new Date(decodedToken.payload.exp * 1000).toISOString(),
                    currentTime: new Date().toISOString(),
                    secondsOverdue: (Date.now() / 1000) - decodedToken.payload.exp
                });
            }
        }

        // Check audience mismatch
        if (decodedToken.payload && decodedToken.payload.aud) {
            const audMatches = [WEB_CLIENT_ID, ANDROID_CLIENT_ID].includes(decodedToken.payload.aud);
            if (!audMatches) {
                logGoogleSignIn('ERROR', 'Token Audience Mismatch Detected', {
                    requestId,
                    tokenAudience: decodedToken.payload.aud,
                    expectedWebClientId: WEB_CLIENT_ID,
                    expectedAndroidClientId: ANDROID_CLIENT_ID,
                    matchesWeb: decodedToken.payload.aud === WEB_CLIENT_ID,
                    matchesAndroid: decodedToken.payload.aud === ANDROID_CLIENT_ID,
                    possibleIssues: [
                        'Client using wrong Google Client ID',
                        'Environment variable GOOGLE_WEB_CLIENT_ID or GOOGLE_ANDROID_CLIENT_ID incorrect',
                        'Token issued for different project'
                    ]
                });
            }
        }

        stepTimings.tokenAnalysis = Date.now() - tokenAnalysisStartTime;

        // Step 2: Verify token configuration
        const configCheckStartTime = Date.now();
        logGoogleSignIn('INFO', 'Verifying Token Configuration', {
            requestId,
            webClientId: WEB_CLIENT_ID.substring(0, 30) + '...',
            webClientIdFull: WEB_CLIENT_ID,
            androidClientId: ANDROID_CLIENT_ID.substring(0, 30) + '...',
            androidClientIdFull: ANDROID_CLIENT_ID,
            audienceCount: [WEB_CLIENT_ID, ANDROID_CLIENT_ID].filter(id => id).length,
            audienceList: [WEB_CLIENT_ID, ANDROID_CLIENT_ID],
            oauth2ClientCreated: !!client,
            clientType: client.constructor.name
        });
        stepTimings.configCheck = Date.now() - configCheckStartTime;

        // Step 3: Verify Google ID token with enhanced error handling
        let ticket, payload;
        const verificationStartTime = Date.now();
        try {
            logGoogleSignIn('INFO', 'Attempting Google Token Verification', {
                requestId,
                audience: [WEB_CLIENT_ID, ANDROID_CLIENT_ID],
                tokenLength: cleanToken.length,
                verificationMethod: 'OAuth2Client.verifyIdToken',
                clientLibrary: 'google-auth-library'
            });

            // Attempt verification with detailed timing
            const verifyStartTime = Date.now();
            ticket = await client.verifyIdToken({
                idToken: cleanToken,
                audience: [WEB_CLIENT_ID, ANDROID_CLIENT_ID]
            });
            const verifyDuration = Date.now() - verifyStartTime;

            logGoogleSignIn('INFO', 'Google Token Verification API Call Completed', {
                requestId,
                durationMs: verifyDuration,
                durationSec: (verifyDuration / 1000).toFixed(3),
                ticketType: ticket ? ticket.constructor.name : 'null',
                hasTicket: !!ticket
            });

            payload = ticket.getPayload();

            logGoogleSignIn('INFO', 'Google Token Verification Success', {
                requestId,
                verificationDurationMs: Date.now() - verificationStartTime,
                payload: {
                    email: payload.email,
                    emailVerified: payload.email_verified,
                    issuer: payload.iss,
                    expectedIssuer: 'accounts.google.com',
                    issuerMatch: payload.iss === 'accounts.google.com' || payload.iss === 'https://accounts.google.com',
                    audience: payload.aud,
                    subject: payload.sub,
                    issuedAt: payload.iat ? new Date(payload.iat * 1000).toISOString() : null,
                    expiresAt: payload.exp ? new Date(payload.exp * 1000).toISOString() : null,
                    hasGivenName: !!payload.given_name,
                    givenName: payload.given_name,
                    hasFamilyName: !!payload.family_name,
                    familyName: payload.family_name,
                    hasPicture: !!payload.picture,
                    picture: payload.picture ? payload.picture.substring(0, 50) + '...' : null,
                    allKeys: Object.keys(payload)
                },
                ticketInfo: {
                    hasEnvelope: !!ticket.getEnvelope(),
                    hasPayload: !!ticket.getPayload()
                }
            });
            stepTimings.verification = Date.now() - verificationStartTime;
        } catch (verifyError) {
            stepTimings.verification = Date.now() - verificationStartTime;
            const errorAnalysis = {
                requestId,
                errorName: verifyError.name,
                errorMessage: verifyError.message,
                errorCode: verifyError.code,
                errorStack: verifyError.stack,
                errorDetails: verifyError.toString(),
                errorType: verifyError.constructor.name,
                allErrorProperties: Object.keys(verifyError),
                verificationDurationMs: Date.now() - verificationStartTime,
                timestamp: new Date().toISOString()
            };

            // Analyze error message for specific issues
            const errorMessageLower = (verifyError.message || '').toLowerCase();
            const errorAnalysisDetails = {
                isAudienceError: errorMessageLower.includes('audience') || errorMessageLower.includes('client_id'),
                isExpiredError: errorMessageLower.includes('expired') || errorMessageLower.includes('exp'),
                isInvalidTokenError: errorMessageLower.includes('invalid') || errorMessageLower.includes('malformed'),
                isNetworkError: errorMessageLower.includes('network') || errorMessageLower.includes('timeout') || errorMessageLower.includes('connect'),
                isSignatureError: errorMessageLower.includes('signature') || errorMessageLower.includes('verify'),
                possibleCauses: []
            };

            if (errorAnalysisDetails.isAudienceError) {
                errorAnalysisDetails.possibleCauses.push(
                    'Client ID mismatch between frontend and backend',
                    'Token issued for different Google OAuth project',
                    'Environment variable GOOGLE_WEB_CLIENT_ID or GOOGLE_ANDROID_CLIENT_ID incorrect',
                    'Client using wrong OAuth configuration'
                );
            }
            if (errorAnalysisDetails.isExpiredError) {
                errorAnalysisDetails.possibleCauses.push(
                    'Token expired before reaching server',
                    'Clock skew between client and server',
                    'Token cached for too long on client'
                );
            }
            if (errorAnalysisDetails.isInvalidTokenError) {
                errorAnalysisDetails.possibleCauses.push(
                    'Token corrupted during transmission',
                    'Token not properly formatted',
                    'Token was manipulated'
                );
            }
            if (errorAnalysisDetails.isNetworkError) {
                errorAnalysisDetails.possibleCauses.push(
                    'Cannot reach Google verification servers',
                    'Network timeout',
                    'Firewall blocking Google API access'
                );
            }
            if (errorAnalysisDetails.isSignatureError) {
                errorAnalysisDetails.possibleCauses.push(
                    'Token signature invalid',
                    'Token was tampered with',
                    'Google public key fetch failed'
                );
            }

            logGoogleSignIn('ERROR', 'Google Token Verification Failed', {
                ...errorAnalysis,
                errorAnalysis: errorAnalysisDetails,
                configuration: {
                    webClientId: WEB_CLIENT_ID,
                    androidClientId: ANDROID_CLIENT_ID,
                    decodedTokenAudience: decodedToken.payload?.aud,
                    audienceMatch: decodedToken.payload?.aud ? [WEB_CLIENT_ID, ANDROID_CLIENT_ID].includes(decodedToken.payload.aud) : false
                },
                troubleshooting: {
                    checkClientId: 'Verify GOOGLE_WEB_CLIENT_ID matches the client ID used in frontend',
                    checkToken: 'Verify token is being sent correctly from client',
                    checkNetwork: 'Check if server can reach Google APIs',
                    checkTime: 'Verify server clock is synchronized'
                }
            });

            // Provide more specific error messages
            let errorMessage = 'Failed to verify Google token';
            let statusCode = 400;
            let suggestedFix = 'Please try signing in again';

            if (errorAnalysisDetails.isAudienceError) {
                errorMessage = 'Token audience mismatch. Please check Google Client ID configuration.';
                statusCode = 401;
                suggestedFix = 'Verify that the Google Client ID used in the frontend matches the backend configuration';
            } else if (errorAnalysisDetails.isExpiredError) {
                errorMessage = 'Google token has expired. Please sign in again.';
                statusCode = 401;
                suggestedFix = 'The token has expired. Please sign in again to get a new token';
            } else if (errorAnalysisDetails.isInvalidTokenError) {
                errorMessage = 'Invalid Google token format.';
                statusCode = 401;
                suggestedFix = 'The token format is invalid. Please sign in again';
            } else if (errorAnalysisDetails.isNetworkError) {
                errorMessage = 'Unable to verify token with Google servers.';
                statusCode = 503;
                suggestedFix = 'Network issue connecting to Google. Please try again later';
            } else if (errorAnalysisDetails.isSignatureError) {
                errorMessage = 'Token signature verification failed.';
                statusCode = 401;
                suggestedFix = 'Token signature is invalid. Please sign in again';
            }

            return res.status(statusCode).json({ 
                error: errorMessage,
                details: verifyError.message,
                suggestedFix,
                requestId,
                timestamp: new Date().toISOString(),
                errorType: errorAnalysisDetails.isAudienceError ? 'audience_mismatch' :
                           errorAnalysisDetails.isExpiredError ? 'token_expired' :
                           errorAnalysisDetails.isInvalidTokenError ? 'invalid_token' :
                           errorAnalysisDetails.isNetworkError ? 'network_error' :
                           errorAnalysisDetails.isSignatureError ? 'signature_error' : 'unknown'
            });
        }

        // Step 4: Check admin restriction
        if (payload.email === 'bhupendrapandey29@gmail.com') {
            logGoogleSignIn('WARN', 'Admin Attempted Google Sign-In', {
                requestId,
                email: payload.email
            });
            return res.status(403).json({ 
                error: 'Admin cannot login with Google. Please use email and password login.',
                requestId,
                timestamp: new Date().toISOString()
            });
        }

        // Step 5: Find or create user
        const dbOperationStartTime = Date.now();
        logGoogleSignIn('INFO', 'Looking Up User in Database', {
            requestId,
            email: payload.email,
            googleId: payload.sub,
            searchBy: 'email',
            mongoConnection: mongoose.connection.readyState === 1 ? 'connected' : mongoose.connection.readyState === 0 ? 'disconnected' : 'connecting'
        });

        let user;
        let userAction = 'existing';
        
        try {
            const findStartTime = Date.now();
            user = await User.findOne({ email: payload.email });
            const findDuration = Date.now() - findStartTime;
            
            logGoogleSignIn('INFO', 'Database Query Completed', {
                requestId,
                queryDurationMs: findDuration,
                userFound: !!user,
                userId: user ? user._id.toString() : null
            });
            
        if (!user) {
                logGoogleSignIn('INFO', 'User Not Found - Creating New User', {
                    requestId,
                    email: payload.email,
                    firstName: payload.given_name || '',
                    lastName: payload.family_name || '',
                    googleId: payload.sub
                });

            user = new User({
                firstName: payload.given_name || '',
                lastName: payload.family_name || '',
                email: payload.email,
                googleId: payload.sub,
                picture: payload.picture || '',
                phone: ''
            });
                
            await user.save();
                userAction = 'created';
                
                logGoogleSignIn('INFO', 'New User Created Successfully', {
                    requestId,
                    userId: user._id.toString(),
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName
                });

            // Notify admins about new user
            if (req.app.get('io')) {
                    try {
                req.app.get('io').emit('new_user', {
                    _id: user._id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    phone: user.phone,
                    isAdmin: user.isAdmin,
                    createdAt: user.createdAt
                });
                        logGoogleSignIn('INFO', 'New User Notification Sent to Admins', {
                            requestId,
                            userId: user._id.toString()
                        });
                    } catch (notifyError) {
                        logGoogleSignIn('WARN', 'Failed to Notify Admins About New User', {
                            requestId,
                            userId: user._id.toString(),
                            error: notifyError.message
                        });
                    }
                }
            } else {
                logGoogleSignIn('INFO', 'Existing User Found', {
                    requestId,
                    userId: user._id.toString(),
                    email: user.email,
                    hasGoogleId: !!user.googleId,
                    googleIdMatch: user.googleId === payload.sub
                });

                // Update Google ID if missing
                if (!user.googleId) {
                    logGoogleSignIn('INFO', 'Updating User with Google ID', {
                        requestId,
                        userId: user._id.toString(),
                        newGoogleId: payload.sub
                    });
            user.googleId = payload.sub;
            await user.save();
                    userAction = 'updated';
                }
            }
        } catch (dbError) {
            logGoogleSignIn('ERROR', 'Database Operation Failed', {
                requestId,
                errorName: dbError.name,
                errorMessage: dbError.message,
                errorStack: dbError.stack,
                errorCode: dbError.code,
                operation: user ? 'update' : 'create'
            });
            throw dbError;
        }

        // Step 6: Generate JWT token
        logGoogleSignIn('INFO', 'Generating JWT Token', {
            requestId,
            userId: user._id.toString(),
            hasJwtSecret: !!process.env.JWT_SECRET
        });

        let token;
        try {
            token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
            logGoogleSignIn('INFO', 'JWT Token Generated Successfully', {
                requestId,
                userId: user._id.toString(),
                tokenLength: token.length
            });
        } catch (jwtError) {
            logGoogleSignIn('ERROR', 'JWT Token Generation Failed', {
                requestId,
                userId: user._id.toString(),
                errorName: jwtError.name,
                errorMessage: jwtError.message,
                hasJwtSecret: !!process.env.JWT_SECRET
            });
            throw jwtError;
        }

        stepTimings.dbOperation = Date.now() - dbOperationStartTime;

        // Step 7: Success response
        const totalDuration = Date.now() - startTime;
        logGoogleSignIn('INFO', 'Google Sign-In Completed Successfully', {
            requestId,
            userId: user._id.toString(),
            email: user.email,
            userAction,
            timing: {
                totalMs: totalDuration,
                totalSec: (totalDuration / 1000).toFixed(3),
                stepTimings: {
                    requestReceived: stepTimings.requestReceived,
                    validation: stepTimings.validation,
                    tokenAnalysis: stepTimings.tokenAnalysis,
                    configCheck: stepTimings.configCheck,
                    verification: stepTimings.verification,
                    dbOperation: stepTimings.dbOperation
                },
                breakdown: {
                    requestProcessing: `${((stepTimings.requestReceived + stepTimings.validation) / totalDuration * 100).toFixed(1)}%`,
                    tokenAnalysis: `${((stepTimings.tokenAnalysis || 0) / totalDuration * 100).toFixed(1)}%`,
                    googleVerification: `${((stepTimings.verification || 0) / totalDuration * 100).toFixed(1)}%`,
                    database: `${((stepTimings.dbOperation || 0) / totalDuration * 100).toFixed(1)}%`
                }
            }
        });

        res.json({
            token,
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                picture: user.picture,
                isAdmin: user.isAdmin
            },
            requestId,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        const duration = Date.now() - startTime;
        logGoogleSignIn('ERROR', 'Google Sign-In Failed - Unexpected Error', {
            requestId,
            errorName: error.name,
            errorMessage: error.message,
            errorStack: error.stack,
            errorCode: error.code,
            errorType: error.constructor.name,
            allErrorProperties: Object.keys(error),
            durationMs: duration,
            durationSec: (duration / 1000).toFixed(3),
            fullError: error.toString(),
            stepTimings: stepTimings,
            lastSuccessfulStep: Object.keys(stepTimings).pop() || 'none',
            environment: {
                nodeEnv: process.env.NODE_ENV,
                nodeVersion: process.version,
                hasJwtSecret: !!process.env.JWT_SECRET,
                hasMongoUri: !!process.env.MONGODB_URI,
                hasWebClientId: !!process.env.GOOGLE_WEB_CLIENT_ID,
                hasAndroidClientId: !!process.env.GOOGLE_ANDROID_CLIENT_ID
            },
            troubleshooting: {
                checkLogs: 'Review all previous log entries for this requestId',
                checkConfig: 'Verify all environment variables are set correctly',
                checkDatabase: 'Verify MongoDB connection is working',
                checkGoogle: 'Verify server can reach Google APIs',
                checkToken: 'Verify token was sent correctly from client'
            }
        });

        // Determine appropriate status code
        let statusCode = 500;
        let errorMessage = 'Failed to authenticate with Google';
        let errorDetails = error.message;

        if (error.name === 'ValidationError') {
            statusCode = 400;
            errorMessage = 'Invalid user data';
        } else if (error.name === 'MongoError' || error.name === 'MongoServerError') {
            statusCode = 500;
            errorMessage = 'Database error occurred';
            // Don't expose internal database errors in production
            if (process.env.NODE_ENV === 'production') {
                errorDetails = 'Internal server error';
            }
        } else if (error.message && error.message.includes('JWT_SECRET')) {
            statusCode = 500;
            errorMessage = 'Server configuration error';
            errorDetails = 'JWT secret not configured';
        }

        res.status(statusCode).json({ 
            error: errorMessage,
            details: errorDetails,
            requestId,
            timestamp: new Date().toISOString()
        });
    }
});

// Get current user
router.get('/me', auth, async (req, res) => {
    res.json(req.user);
});

// Refresh token
router.post('/refresh-token', auth, async (req, res) => {
    try {
        // Generate new token
        const newToken = jwt.sign({ userId: req.user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        
        res.json({
            token: newToken,
            user: {
                _id: req.user._id,
                firstName: req.user.firstName,
                lastName: req.user.lastName,
                email: req.user.email,
                phone: req.user.phone,
                isAdmin: req.user.isAdmin
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Get all users (admin only)
router.get('/users', auth, async (req, res) => {
    try {
        if (!req.user.isAdmin) {
            return res.status(403).json({ error: 'Not authorized' });
        }
        const users = await User.find({ isAdmin: false })
            .select('-password -googleId')
            .sort({ createdAt: -1 });
        res.json({ users });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Delete user account
router.delete('/delete-account', auth, async (req, res) => {
    try {
        // Find and delete all messages associated with the user
        await Message.deleteMany({
            $or: [
                { sender: req.user._id },
                { receiver: req.user._id }
            ]
        });

        // Delete the user account
        await User.findByIdAndDelete(req.user._id);

        res.json({ message: 'Account and associated data deleted successfully' });
    } catch (error) {
        console.error('Error deleting account:', error);
        res.status(500).json({ error: 'Failed to delete account' });
    }
});

module.exports = router; 