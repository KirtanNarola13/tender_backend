const { Product, Warehouse } = require('../models/Inventory');
const StockLog = require('../models/StockLog');

// @desc    Create a new product
// @route   POST /api/inventory/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
    try {
        const product = await Product.create(req.body);
        res.status(201).json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Update a product
// @route   PUT /api/inventory/products/:id
// @access  Private/Admin
exports.updateProduct = async (req, res) => {
    try {
        const { name, sku, category, description, images, steps } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        if (name !== undefined) product.name = name;
        if (sku !== undefined) product.sku = sku;
        if (category !== undefined) product.category = category;
        if (description !== undefined) product.description = description;
        if (images !== undefined) product.images = images;
        if (steps !== undefined) product.steps = steps;

        await product.save();
        res.json(product);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// @desc    Delete a product
// @route   DELETE /api/inventory/products/:id
// @access  Private/Admin
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });
        await product.deleteOne();
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get all products
// @route   GET /api/inventory/products
// @access  Private
exports.getProducts = async (req, res) => {
    try {
        const products = await Product.find({});
        res.json(products);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Create a new warehouse
// @route   POST /api/inventory/warehouses
// @access  Private/Admin
exports.createWarehouse = async (req, res) => {
    try {
        const warehouse = await Warehouse.create(req.body);
        res.status(201).json(warehouse);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc    Get all warehouses
// @route   GET /api/inventory/warehouses
// @access  Private
exports.getWarehouses = async (req, res) => {
    try {
        const warehouses = await Warehouse.find({}).populate('manager', 'name');
        res.json(warehouses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Add stock to a warehouse
// @route   POST /api/inventory/stock/add
// @access  Private/Admin
exports.addStock = async (req, res) => {
    try {
        const { productId, warehouseId, quantity, reason } = req.body;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const stockIndex = product.stock.findIndex(s => s.warehouse.toString() === warehouseId);
        let previousStock = 0;

        if (stockIndex > -1) {
            previousStock = product.stock[stockIndex].quantity;
            product.stock[stockIndex].quantity += Number(quantity);
        } else {
            product.stock.push({ warehouse: warehouseId, quantity: Number(quantity) });
        }

        // Recalculate total stock
        product.totalStock = product.stock.reduce((acc, curr) => acc + curr.quantity, 0);

        await product.save();

        // Create Stock Log
        await StockLog.create({
            product: productId,
            warehouse: warehouseId,
            action: 'IN',
            quantity: Number(quantity),
            previousStock,
            newStock: previousStock + Number(quantity),
            reason: reason || 'Stock Addition',
            performedBy: req.user._id
        });

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Transfer stock between warehouses
// @route   POST /api/inventory/stock/transfer
// @access  Private/Admin
exports.transferStock = async (req, res) => {
    try {
        const { productId, fromWarehouseId, toWarehouseId, quantity, reason } = req.body;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const fromIndex = product.stock.findIndex(s => s.warehouse.toString() === fromWarehouseId);
        if (fromIndex === -1 || product.stock[fromIndex].quantity < quantity) {
            return res.status(400).json({ message: 'Insufficient stock in source warehouse' });
        }

        // Deduct from source
        const prevSource = product.stock[fromIndex].quantity;
        product.stock[fromIndex].quantity -= Number(quantity);

        // Add to destination
        const toIndex = product.stock.findIndex(s => s.warehouse.toString() === toWarehouseId);
        let prevDest = 0;
        if (toIndex > -1) {
            prevDest = product.stock[toIndex].quantity;
            product.stock[toIndex].quantity += Number(quantity);
        } else {
            product.stock.push({ warehouse: toWarehouseId, quantity: Number(quantity) });
        }

        await product.save();

        // Create Stock Log (Reflecting the Transfer)
        // Log for Source (OUT)
        await StockLog.create({
            product: productId,
            warehouse: fromWarehouseId,
            action: 'TRANSFER',
            quantity: -Number(quantity),
            previousStock: prevSource,
            newStock: prevSource - Number(quantity),
            reason: `Transfer to ${toWarehouseId} - ${reason || ''}`,
            performedBy: req.user._id
        });

        // Log for Dest (IN)
        await StockLog.create({
            product: productId,
            warehouse: toWarehouseId,
            action: 'TRANSFER',
            quantity: Number(quantity),
            previousStock: prevDest,
            newStock: prevDest + Number(quantity),
            reason: `Transfer from ${fromWarehouseId} - ${reason || ''}`,
            performedBy: req.user._id
        });

        res.json(product);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get Stock Logs
// @route   GET /api/inventory/logs
// @access  Private/Admin
exports.getStockLogs = async (req, res) => {
    try {
        const logs = await StockLog.find({})
            .populate('product', 'name sku')
            .populate('warehouse', 'name')
            .populate('performedBy', 'name')
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
