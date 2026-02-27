/**
 * Cart Page Logic (v2-cart.js)
 * Backbone.js + jQuery
 */

$(function () {
    // Basic state management reusing the existing local storage key
    const CartState = {
        items: {}, // All items from offerBuilderState_v3

        init: function () {
            const stored = localStorage.getItem('offerBuilderState_v3');
            if (stored) {
                this.items = JSON.parse(stored);
            }
        },

        // Get items that are "In Cart"
        getCartItems: function () {
            return Object.values(this.items).filter(item => item.offerStatus === 'In Cart');
        },

        // Group items by warehouse
        getWarehouses: function () {
            const cartItems = this.getCartItems();
            const warehouses = {};

            cartItems.forEach(item => {
                const wh = item.warehouse || 'Unassigned';
                if (!warehouses[wh]) {
                    warehouses[wh] = {
                        name: wh,
                        items: [],
                        uniqueSkus: new Set(),
                        totalQty: 0,
                        totalValue: 0
                    };
                }

                warehouses[wh].items.push(item);
                warehouses[wh].uniqueSkus.add(item.sku);

                const qty = parseInt(item.submittedQty || item.qty || 0);
                const price = parseFloat(item.submittedPrice || item.price || 0);

                warehouses[wh].totalQty += qty;
                warehouses[wh].totalValue += (qty * price);
            });

            return warehouses;
        },

        removeItem: function (sku) {
            if (this.items[sku]) {
                // If it was in cart, reverting it to maybe Draft or Approved? 
                // For now, removing from cart simply means deleting it from state so it can be re-offered, 
                // but technically we might want to just revert its status if it was "Accepted".
                // Since user said "remove them from the cart", we will delete it from pinnedItems for simplicity in prototype.
                delete this.items[sku];
                this.save();
            }
        },

        checkoutItems: function (skus) {
            skus.forEach(sku => {
                if (this.items[sku]) {
                    // In a real app, this sends to a backend. Here we just remove them from the cart state.
                    delete this.items[sku];
                }
            });
            this.save();
        },

        save: function () {
            localStorage.setItem('offerBuilderState_v3', JSON.stringify(this.items));
        }
    };

    // Cart View
    const CartView = Backbone.View.extend({
        el: '#cart-app',

        events: {
            'click .cart-tab': 'switchWarehouse',
            'change #select-all-cart': 'toggleSelectAll',
            'change .cart-item-checkbox-input': 'updateSelectionState',
            'click .btn-remove-selected': 'removeSelected',
            'click .btn-remove-item': 'removeItem',
            'click .btn-checkout': 'checkout'
        },

        initialize: function () {
            CartState.init();
            this.activeWarehouse = null;
            this.selectedSkus = new Set();
            this.render();
        },

        switchWarehouse: function (e) {
            const wh = $(e.currentTarget).data('warehouse');
            if (wh !== this.activeWarehouse) {
                this.activeWarehouse = wh;
                this.selectedSkus.clear();
                this.render();
            }
        },

        toggleSelectAll: function (e) {
            const isChecked = $(e.target).prop('checked');
            this.$('.cart-item-checkbox-input').prop('checked', isChecked);

            this.selectedSkus.clear();
            if (isChecked) {
                this.$('.cart-item-checkbox-input').each((i, el) => {
                    this.selectedSkus.add($(el).data('sku'));
                });
            }
            this.updateSelectionState();
        },

        updateSelectionState: function () {
            let totalSelectedValue = 0;
            let totalSelectedQty = 0;
            this.selectedSkus.clear();

            this.$('.cart-item-checkbox-input:checked').each((i, el) => {
                const sku = $(el).data('sku');
                this.selectedSkus.add(sku);
            });

            // Update UI
            const allChecked = this.$('.cart-item-checkbox-input').length > 0 &&
                this.$('.cart-item-checkbox-input:checked').length === this.$('.cart-item-checkbox-input').length;
            this.$('#select-all-cart').prop('checked', allChecked);

            // Calc totals
            const warehouses = CartState.getWarehouses();
            if (this.activeWarehouse && warehouses[this.activeWarehouse]) {
                warehouses[this.activeWarehouse].items.forEach(item => {
                    if (this.selectedSkus.has(item.sku)) {
                        const qty = parseInt(item.submittedQty || item.qty || 0);
                        const price = parseFloat(item.submittedPrice || item.price || 0);
                        totalSelectedQty += qty;
                        totalSelectedValue += (qty * price);
                    }
                });
            }

            // Update buttons and totals
            const hasSelection = this.selectedSkus.size > 0;
            this.$('.btn-remove-selected').prop('disabled', !hasSelection);
            this.$('.btn-checkout').prop('disabled', !hasSelection);

            if (hasSelection) {
                this.$('.btn-checkout').html(`Checkout ${totalSelectedQty} Items`);
                this.$('.checkout-total-value').html('$' + totalSelectedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
            } else {
                this.$('.btn-checkout').html(`Checkout Selected`);
                this.$('.checkout-total-value').html('$0.00');
            }
        },

        removeSelected: function () {
            if (this.selectedSkus.size === 0) return;
            if (confirm(`Remove ${this.selectedSkus.size} items from the cart?`)) {
                this.selectedSkus.forEach(sku => {
                    CartState.removeItem(sku);
                });
                this.selectedSkus.clear();
                this.render();
            }
        },

        removeItem: function (e) {
            const sku = $(e.currentTarget).data('sku');
            if (confirm('Remove this item from the cart?')) {
                CartState.removeItem(sku);
                this.selectedSkus.delete(sku);
                this.render();
            }
        },

        checkout: function () {
            if (this.selectedSkus.size === 0) return;
            CartState.checkoutItems(Array.from(this.selectedSkus));
            this.selectedSkus.clear();

            $('#checkout-success-modal').modal('show');
            $('#checkout-success-modal').on('hidden.bs.modal', () => {
                this.render();
            });
        },

        render: function () {
            const warehouses = CartState.getWarehouses();
            const whNames = Object.keys(warehouses);

            if (whNames.length === 0) {
                this.$el.html(`
                    <div class="text-center" style="padding: 60px 20px;">
                        <span class="material-icons" style="font-size: 64px; color: #ddd; margin-bottom: 20px;">shopping_cart</span>
                        <h3 style="color: #666;">Your cart is empty</h3>
                        <p class="text-muted" style="margin-bottom: 20px;">Add items to your cart from the stock list or offer worksheet.</p>
                        <a href="v2.html" class="btn btn-primary">Return to Stock List</a>
                    </div>
                `);
                return;
            }

            // Select first warehouse if none active or active one was removed
            if (!this.activeWarehouse || !warehouses[this.activeWarehouse]) {
                this.activeWarehouse = whNames[0];
            }

            let html = '<div class="cart-tabs-nav">';

            // Build Tabs
            whNames.forEach(wh => {
                const data = warehouses[wh];
                const isActive = wh === this.activeWarehouse ? 'active' : '';
                html += `
                    <button class="cart-tab ${isActive}" data-warehouse="${wh}">
                        <span class="cart-tab-title">${data.name}</span>
                        <span class="badge" style="background-color: ${wh === this.activeWarehouse ? '#0070B9' : '#999'};">${data.uniqueSkus.size}</span>
                    </button>
                `;
            });
            html += '</div>';

            // Build Active Warehouse Content
            const activeData = warehouses[this.activeWarehouse];

            html += `
                <div class="cart-warehouse-content" style="flex-grow: 1; display: flex; flex-direction: column;">
                    <div style="flex-grow: 1;">
                        <div class="cart-toolbar">
                            <div class="checkbox">
                                <label style="font-weight: 500;">
                                    <input type="checkbox" id="select-all-cart"> Select All in ${this.activeWarehouse}
                                </label>
                            </div>
                            <button class="btn btn-default btn-sm btn-remove-selected" disabled>
                                <span class="material-icons" style="font-size: 16px; vertical-align: text-bottom;">delete_outline</span> Remove Selected
                            </button>
                        </div>
                        
                        <div class="cart-items-list">
            `;

            activeData.items.forEach(item => {
                const qty = parseInt(item.submittedQty || item.qty || 0);
                const price = parseFloat(item.submittedPrice || item.price || 0);
                const isSelected = this.selectedSkus.has(item.sku) ? 'checked' : '';

                html += `
                    <div class="cart-item-row">
                        <div class="cart-item-checkbox">
                            <input type="checkbox" class="cart-item-checkbox-input" data-sku="${item.sku}" ${isSelected}>
                        </div>
                        <div class="cart-item-info">
                            <div class="cart-item-title">${item.manufacturer || ''} ${item.model || ''}</div>
                            <div class="cart-item-meta">
                                <span class="cart-item-desc">${item.description}</span>
                                <span class="label label-default">${item.grade}</span>
                                <span class="cart-item-skus">SKU: ${item.sku}</span>
                            </div>
                        </div>
                        <div class="cart-item-details">
                            <div class="cart-item-price-info">
                                <span class="text-muted" style="font-size: 12px; display:block;">Price</span>
                                <span>$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                            <div class="cart-item-qty">
                                <span class="text-muted" style="font-size: 12px; display:block;">Qty</span>
                                <strong>${qty}</strong>
                            </div>
                            <div class="cart-item-total">
                                <span class="text-muted" style="font-size: 12px; display:block; text-align: right;">Total</span>
                                <span>$${(qty * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div class="cart-item-actions">
                            <button class="btn-remove-item" data-sku="${item.sku}" title="Remove from Cart">
                                <span class="material-icons">close</span>
                            </button>
                        </div>
                    </div>
                `;
            });

            html += `
                    </div> <!-- End flex-grow: 1 -->
                    
                    <!-- Checkout Bar -->
                    <div class="cart-checkout-bar">
                        <div>
                            <div class="checkout-total-label">Selected Total</div>
                            <div class="checkout-total-value">$0.00</div>
                        </div>
                        <button class="btn btn-primary btn-lg btn-checkout" disabled style="padding: 10px 30px; font-weight: 600; font-size: 16px;">
                            Checkout Selected
                        </button>
                    </div>
                </div>
            `;

            this.$el.html(html);
            this.updateSelectionState();
        }
    });

    // Initialize View
    new CartView();
});
