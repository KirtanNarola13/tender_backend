const { Product, Warehouse } = require('../models/Inventory');
const StockLog = require('../models/StockLog');

// @desc    Create a new product
// @route   POST /api/inventory/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
    try {
        const { ...productData } = req.body;
        let product = new Product(productData);
        await product.save();

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
        const { branch } = req.query;
        let query = {};
        
        // If branch is provided, we only show products that HAVE stock in warehouses of that branch
        // Or if the warehouse list itself is filtered.
        // For simplicity, we filter the 'stock' array inside the products if needed, 
        // but usually, we just return all products and filter the stock display on frontend.
        // However, if we want to filter the WHOLE list:
        if (branch && branch !== 'all') {
            const warehousesInBranch = await Warehouse.find({ branch }).select('_id');
            const warehouseIds = warehousesInBranch.map(w => w._id);
            query['stock.warehouse'] = { $in: warehouseIds };
        }

        const products = await Product.find(query).populate('stock.warehouse', 'name branch');
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
        const { branch } = req.query;
        let query = {};
        if (branch && branch !== 'all') {
            query.branch = branch;
        }
        const warehouses = await Warehouse.find(query).populate('manager', 'name');
        res.json(warehouses);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Add stock to a warehouse
// @route   POST /api/inventory/stock/add
// @access  Private/Admin
/*
exports.addStock = async (req, res) => {
    // Disabled: Stock must be added via Purchase Orders only
    res.status(403).json({ message: 'Stock addition is only allowed via Purchase Orders' });
};
*/

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
