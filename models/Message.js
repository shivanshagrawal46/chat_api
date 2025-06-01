const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    receiver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        validate: {
            validator: function(v) {
                // Check if the string is a valid base64
                const base64Regex = /^[A-Za-z0-9+/=]+$/;
                return base64Regex.test(v);
            },
            message: props => `${props.value} is not a valid base64 string!`
        }
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Message', messageSchema); 