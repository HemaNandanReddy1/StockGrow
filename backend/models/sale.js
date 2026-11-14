
const mongoose = require("mongoose");

const saleSchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            min: 1
        },
        price: {
            type: Number,
            required: true,
            min: 0
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
