const PurchaseOrder = require('../models/PurchaseOrder');
const { Product } = require('../models/Inventory');
const StockLog = require('../models/StockLog');

// @desc    Create a new Purchase Order
// @route   POST /api/purchase-orders
// @access  Private/Admin
exports.createPurchaseOrder = async (req, res) => {
    try {
        const { party, warehouse, items, date, poNumber: manualPoNumber, project } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({ message: 'At least one item is required' });
        }

        let poNumber = manualPoNumber;

        // If no PO number provided, generate one
        if (!poNumber) {
            // Generate PO Number: PO-YYYYMMDD-XXX
        const now = new Date();
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
        
        // Find last PO for THIS EXACT DATE string to ensure correct sequence
        const lastPO = await PurchaseOrder.findOne({
            poNumber: new RegExp(`^PO-${dateStr}-`)
        }).sort({ poNumber: -1 });

        let sequence = '001';
        if (lastPO && lastPO.poNumber) {
            const parts = lastPO.poNumber.split('-');
            const lastSeq = parseInt(parts[parts.length - 1]);
            if (!isNaN(lastSeq)) {
                sequence = String(lastSeq + 1).padStart(3, '0');
            }
        }

        poNumber = `PO-${dateStr}-${sequence}`;
        }

        // Final duplicate check if manually provided
        if (manualPoNumber) {
            const existing = await PurchaseOrder.findOne({ poNumber });
            if (existing) return res.status(400).json({ message: `PO Number ${poNumber} already exists` });
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
            project: project || undefined,
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
        const { deliveryStatus, deliveredItems } = req.body; // deliveredItems: [{ productId, quantity }]

        const po = await PurchaseOrder.findById(id);
        if (!po) return res.status(404).json({ message: 'Purchase Order not found' });

        // Simple status change (e.g. IN_TRANSIT)
        if (deliveryStatus && !deliveredItems) {
            po.deliveryStatus = deliveryStatus;
            await po.save();
            return res.json(po);
        }

        // Processing a Delivery (Partial or Full)
        if (deliveredItems && deliveredItems.length > 0) {
            let workOrderId;
            if (po.project) {
                const ProjectModel = require('../models/Project').Project;
                const proj = await ProjectModel.findById(po.project).populate('workOrder');
                workOrderId = proj?.workOrder?._id || proj?.workOrder;
            }

            const currentDelivery = {
                items: [],
                deliveredAt: new Date(),
                performedBy: req.user._id
            };

            for (const dItem of deliveredItems) {
                const poItem = po.items.find(i => i.product.toString() === dItem.productId.toString());
                if (!poItem) continue;

                const qtyDelivered = Number(dItem.quantity);
                if (qtyDelivered <= 0) continue;

                // Validation: Cannot exceed total pieces
                const currentReceived = poItem.receivedQuantity || 0;
                if (currentReceived + qtyDelivered > poItem.quantity) {
                    return res.status(400).json({ message: `Delivery for ${poItem.productName} exceeds remaining quantity` });
                }

                // Update received quantity
                poItem.receivedQuantity = currentReceived + qtyDelivered;
                currentDelivery.items.push({ 
                    product: poItem.product, 
                    quantity: qtyDelivered 
                });

                // Update Product Stock
                const product = await Product.findById(poItem.product);
                if (!product) continue;

                const stockIndex = product.stock.findIndex(s => s.warehouse.toString() === po.warehouse.toString());
                let previousStock = 0;

                if (stockIndex > -1) {
                    previousStock = product.stock[stockIndex].quantity;
                    product.stock[stockIndex].quantity += qtyDelivered;
                } else {
                    product.stock.push({ warehouse: po.warehouse, quantity: qtyDelivered });
                }

                product.totalStock = product.stock.reduce((acc, curr) => acc + curr.quantity, 0);
                await product.save();

                // Create Stock Log
                await StockLog.create({
                    product: poItem.product,
                    warehouse: po.warehouse,
                    action: 'IN',
                    quantity: qtyDelivered,
                    previousStock,
                    newStock: previousStock + qtyDelivered,
                    reason: `PO Partial Delivery: ${po.poNumber}`,
                    purchaseOrder: po._id,
                    referenceProject: po.project || undefined,
                    referenceWorkOrder: workOrderId || undefined,
                    performedBy: req.user._id
                });
            }

            po.partialDeliveries.push(currentDelivery);

            // Determine if fully delivered
            const totalToOrder = po.items.reduce((acc, i) => acc + i.quantity, 0);
            const totalReceived = po.items.reduce((acc, i) => acc + (i.receivedQuantity || 0), 0);

            po.deliveryStatus = totalReceived >= totalToOrder ? 'DELIVERED' : 'PARTIAL';
            await po.save();
            return res.json(po);
        }

        res.status(400).json({ message: 'Invalid update request' });
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
            .populate('partialDeliveries.performedBy', 'name')
            .populate({
                path: 'project',
                populate: { path: 'workOrder', select: 'workOrderNumber' }
            })
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
            .populate('createdBy', 'name')
            .populate('partialDeliveries.performedBy', 'name')
            .populate({
                path: 'project',
                populate: { path: 'workOrder', select: 'workOrderNumber' }
            });
        
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
        .populate({
            path: 'project',
            populate: { path: 'workOrder', select: 'workOrderNumber' }
        })
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
