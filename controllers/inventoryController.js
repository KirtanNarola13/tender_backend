const { Product, Warehouse } = require('../models/Inventory');
const StockLog = require('../models/StockLog');
const Project = require('../models/Project').Project; // Accessing the Project model specifically
const WorkOrder = require('../models/WorkOrder');

// @desc    Create a new product
// @route   POST /api/inventory/products
// @access  Private/Admin
exports.createProduct = async (req, res) => {
    try {
        const { initialStock, ...productData } = req.body;
        let product = new Product(productData);

        // Handle initial stock if provided
        if (initialStock && initialStock.warehouseId && initialStock.quantity > 0) {
            product.stock = [{
                warehouse: initialStock.warehouseId,
                quantity: Number(initialStock.quantity)
            }];
            product.totalStock = Number(initialStock.quantity);
        }

        await product.save();

        // Create Stock Log if initial stock was added
        if (initialStock && initialStock.warehouseId && initialStock.quantity > 0) {
            await StockLog.create({
                product: product._id,
                warehouse: initialStock.warehouseId,
                action: 'IN',
                quantity: Number(initialStock.quantity),
                previousStock: 0,
                newStock: Number(initialStock.quantity),
                reason: 'Initial Stock Adjustment',
                performedBy: req.user._id
            });
        }

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
        const { name, sku, category, description, images, steps, stockUpdate } = req.body;
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        if (name !== undefined) product.name = name;
        if (sku !== undefined) product.sku = sku;
        if (category !== undefined) product.category = category;
        if (description !== undefined) product.description = description;
        if (images !== undefined) product.images = images;
        if (steps !== undefined) product.steps = steps;

        // Handle direct stock update if passed
        if (stockUpdate && stockUpdate.warehouseId && stockUpdate.quantity !== undefined) {
            const qtyToAdd = Number(stockUpdate.quantity);
            const wId = stockUpdate.warehouseId;

            const stockIndex = product.stock.findIndex(s => (s.warehouse?._id || s.warehouse).toString() === wId.toString());
            let previousStock = 0;

            if (stockIndex > -1) {
                previousStock = product.stock[stockIndex].quantity;
                product.stock[stockIndex].quantity += qtyToAdd;
            } else {
                product.stock.push({ warehouse: wId, quantity: qtyToAdd });
            }

            product.totalStock = product.stock.reduce((acc, s) => acc + s.quantity, 0);

            // Create Log
            await StockLog.create({
                product: product._id,
                warehouse: wId,
                action: qtyToAdd >= 0 ? 'ADJUSTMENT' : 'ADJUSTMENT',
                quantity: qtyToAdd,
                previousStock,
                newStock: previousStock + qtyToAdd,
                reason: stockUpdate.reason || 'Manual Adjustment',
                performedBy: req.user._id
            });
        }

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

        const products = await Product.find(query).populate('stock.warehouse', 'name branch location');
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
// @desc    Add stock to a warehouse (Manual adjustment)
// @route   POST /api/inventory/stock/add
// @access  Private/Admin
exports.addStock = async (req, res) => {
    try {
        const { productId, warehouseId, quantity, reason, projectId, workOrderId } = req.body;

        const product = await Product.findById(productId);
        if (!product) return res.status(404).json({ message: 'Product not found' });

        const qtyToAdd = Number(quantity);
        const stockIndex = product.stock.findIndex(s => (s.warehouse?._id || s.warehouse).toString() === warehouseId.toString());

        let previousStock = 0;
        if (stockIndex > -1) {
            previousStock = product.stock[stockIndex].quantity;
            product.stock[stockIndex].quantity += qtyToAdd;
        } else {
            product.stock.push({ warehouse: warehouseId, quantity: qtyToAdd });
        }

        product.totalStock = product.stock.reduce((acc, s) => acc + s.quantity, 0);
        await product.save();

        // Create log entry
        await StockLog.create({
            product: productId,
            warehouse: warehouseId,
            action: 'ADJUSTMENT', // Can be 'ADJUSTMENT' for manual adds
            quantity: qtyToAdd,
            previousStock,
            newStock: previousStock + qtyToAdd,
            reason: reason || 'Manual Stock Addition',
            referenceProject: projectId || undefined,
            referenceWorkOrder: workOrderId || undefined,
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
        const { productId, fromWarehouseId, toWarehouseId, quantity, reason, projectId, workOrderId } = req.body;

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
            referenceProject: projectId || undefined,
            referenceWorkOrder: workOrderId || undefined,
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
            referenceProject: projectId || undefined,
            referenceWorkOrder: workOrderId || undefined,
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
        const { product } = req.query;
        let query = {};
        if (product) {
            query.product = product;
        }

        const logs = await StockLog.find(query)
            .populate('product', 'name sku')
            .populate('warehouse', 'name')
            .populate('performedBy', 'name')
            .populate({
                path: 'referenceWorkOrder',
                select: 'workOrderNumber'
            })
            .populate({
                path: 'purchaseOrder',
                populate: {
                    path: 'project',
                    populate: {
                        path: 'workOrder',
                        select: 'workOrderNumber'
                    }
                }
            })
            .sort({ createdAt: -1 })
            .limit(100);
        res.json(logs);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
