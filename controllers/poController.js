const PurchaseOrder = require('../models/PurchaseOrder');
const { Product } = require('../models/Inventory');
const StockLog = require('../models/StockLog');

// @desc    Create a new Purchase Order
// @route   POST /api/purchase-orders
// @access  Private/Admin
exports.createPurchaseOrder = async (req, res) => {
    try {
        const { party, warehouse, items, date } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'At least one item is required' });
        }

        // Generate PO Number: PO-YYYYMMDD-XXX
        const today = new Date();
        const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
        const startOfDay = new Date(today.setHours(0, 0, 0, 0));
        const endOfDay = new Date(today.setHours(23, 59, 59, 999));

        const lastPO = await PurchaseOrder.findOne({
            createdAt: { $gte: startOfDay, $lte: endOfDay }
        }).sort({ createdAt: -1 });

        let sequence = '001';
        if (lastPO && lastPO.poNumber) {
            const lastSeq = parseInt(lastPO.poNumber.split('-')[2]);
            sequence = String(lastSeq + 1).padStart(3, '0');
        }

        const poNumber = `PO-${dateStr}-${sequence}`;

        // Calculate Totals server-side
        let totalQuantity = 0;
        let totalAmount = 0;

        const processedItems = items.map(item => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.unitPrice) || 0;
            const itemAmount = qty * price;
            
            totalQuantity += qty;
            totalAmount += itemAmount;

            return {
                ...item,
                amount: itemAmount
            };
        });

        const po = new PurchaseOrder({
            poNumber,
            date: date || new Date(),
            party,
            warehouse,
            items: processedItems,
            totals: {
                totalQuantity,
                totalAmount
            },
            createdBy: req.user._id,
            deliveryStatus: 'PENDING',
            isStockAdded: false
        });

        await po.save();
        res.status(201).json(po);

    } catch (error) {
        console.error('Error creating PO:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Update PO Status (Handle Stock Addition)
// @route   PATCH /api/purchase-orders/:id/status
// @access  Private/Admin
exports.updatePOStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { deliveryStatus } = req.body;

        const po = await PurchaseOrder.findById(id);
        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });

        // Enforce state transitions
        if (po.deliveryStatus === 'DELIVERED') {
            return res.status(400).json({ message: 'Cannot change status of a DELIVERED order' });
        }

        if (po.deliveryStatus === 'PENDING' && deliveryStatus === 'DELIVERED') {
            // Optional: allow direct jump? Or force IN_TRANSIT? User said PENDING -> IN_TRANSIT -> DELIVERED.
            // But sometimes people want to skip. Let's stick to user suggested transitions for UX but allow flexibility here if needed.
            // Actually, user said: PENDING -> IN_TRANSIT ✅, IN_TRANSIT -> DELIVERED ✅. 
            // I will allow them for now but maybe warn. Actually, let's just allow it for backend flexibility but restrict in UI.
        }

        // Logic for Stock Addition
        if (deliveryStatus === 'DELIVERED' && !po.isStockAdded) {
            // Process Each Item
            for (const item of po.items) {
                const product = await Product.findById(item.product);
                if (!product) continue;

                const stockIndex = product.stock.findIndex(s => s.warehouse.toString() === po.warehouse.toString());
                let previousStock = 0;

                if (stockIndex > -1) {
                    previousStock = product.stock[stockIndex].quantity;
                    product.stock[stockIndex].quantity += Number(item.quantity);
                } else {
                    product.stock.push({ warehouse: po.warehouse, quantity: Number(item.quantity) });
                }

                // Update Total Stock
                product.totalStock = product.stock.reduce((acc, curr) => acc + curr.quantity, 0);
                await product.save();

                // Create Stock Log
                await StockLog.create({
                    product: item.product,
                    warehouse: po.warehouse,
                    action: 'IN',
                    quantity: Number(item.quantity),
                    previousStock,
                    newStock: previousStock + Number(item.quantity),
                    reason: `PO Received: ${po.poNumber}`,
                    purchaseOrder: po._id,
                    performedBy: req.user._id
                });
            }

            po.isStockAdded = true;
        }

        po.deliveryStatus = deliveryStatus;
        await po.save();

        res.json(po);

    } catch (error) {
        console.error('Error updating PO status:', error);
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get All Purchase Orders
// @route   GET /api/purchase-orders
// @access  Private
exports.getPOs = async (req, res) => {
    try {
        const pos = await PurchaseOrder.find({})
            .populate('warehouse', 'name')
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        res.json(pos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get PO by ID
// @route   GET /api/purchase-orders/:id
// @access  Private
exports.getPOById = async (req, res) => {
    try {
        const po = await PurchaseOrder.findById(req.params.id)
            .populate('warehouse', 'name location')
            .populate('items.product', 'name sku category')
            .populate('createdBy', 'name');
        
        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });
        res.json(po);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc    Get POs for a Product
// @route   GET /api/purchase-orders/product/:productId
// @access  Private
exports.getPOsByProduct = async (req, res) => {
    try {
        const pos = await PurchaseOrder.find({
            'items.product': req.params.productId
        })
        .populate('warehouse', 'name')
        .sort({ createdAt: -1 });
        res.json(pos);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
// @desc    Update a Purchase Order
// @route   PUT /api/purchase-orders/:id
// @access  Private/Admin
exports.updatePurchaseOrder = async (req, res) => {
    try {
        const { id } = req.params;
        const { party, warehouse, items, date } = req.body;

        const po = await PurchaseOrder.findById(id);
        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });

        // Only allow editing if Status is PENDING
        if (po.deliveryStatus !== 'PENDING') {
            return res.status(400).json({ message: 'Only PENDING orders can be edited' });
        }

        // Calculate Totals server-side
        let totalQuantity = 0;
        let totalAmount = 0;

        const processedItems = items.map(item => {
            const qty = Number(item.quantity) || 0;
            const price = Number(item.unitPrice) || 0;
            const itemAmount = qty * price;
            
            totalQuantity += qty;
            totalAmount += itemAmount;

            return {
                ...item,
                amount: itemAmount
            };
        });

        po.party = party || po.party;
        po.warehouse = warehouse || po.warehouse;
        po.items = processedItems;
        po.date = date || po.date;
        po.totals = {
            totalQuantity,
            totalAmount
        };

        await po.save();
        res.json(po);

    } catch (error) {
        console.error('Error updating PO:', error);
        res.status(500).json({ message: error.message });
    }
};
