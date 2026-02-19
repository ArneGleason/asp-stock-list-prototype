/**
 * Application Logic
 * Backbone.js + jQuery
 */

$(function () {

    // --- Models & Collections ---

    // --- Models & Collections ---

    const OfferBuilderState = {
        pinnedItems: {}, // Map of SKU -> { item data }

        init: function () {
            window.OfferBuilderState = this; // Expose for debugging
            const stored = localStorage.getItem('offerBuilderState');
            if (stored) {
                this.pinnedItems = JSON.parse(stored);
                // Migration: Ensure all items have isPinned property (legacy support)
                Object.values(this.pinnedItems).forEach(item => {
                    if (item.isPinned === undefined) {
                        item.isPinned = true;
                    }
                });
            }
            this.triggerUpdate();
        },

        // Toggle a specific variant
        togglePin: function (variant) {
            const sku = variant.sku;

            if (this.pinnedItems[sku]) {
                // Item exists. Toggle its pinned state.
                const item = this.pinnedItems[sku];
                if (item.isPinned) {
                    item.isPinned = false;
                    // If it's just a draft (not sent), we can remove it entirely when unpinned
                    if (!item.offerStatus || item.offerStatus === 'Draft') {
                        delete this.pinnedItems[sku];
                    }
                } else {
                    item.isPinned = true;
                }
            } else {
                // New item. Create it as pinned.
                this.pinnedItems[sku] = {
                    sku: variant.sku,
                    group_id: variant.group_id,
                    model: variant.model,
                    manufacturer: variant.manufacturer,
                    description: variant.description || ((variant.color || '') + ' ' + (variant.network || '')).trim(),
                    grade: variant.grade,
                    warehouse: variant.warehouse,
                    qty: variant.offerQty || 0,
                    price: variant.offerPrice || 0,
                    submittedQty: variant.offerQty || 0, // Snapshot for comparison
                    submittedPrice: variant.offerPrice || 0, // Snapshot for comparison
                    counterQty: variant.counterQty || 0,
                    counterPrice: variant.counterPrice || 0,
                    availableQty: variant.quantity,
                    listPrice: variant.price,
                    offerStatus: variant.offerStatus,
                    isPinned: true // Default to true for new pins
                };
            }
            this.save();
            this.triggerUpdate();
        },

        // Toggle all variants in a group
        toggleGroup: function (groupModel) {
            const variants = groupModel.get('variants') || [];
            const groupId = groupModel.id;

            // Filter for pinnable variants (Draft or no status)
            // Post-draft statuses (Pending, Accepted, etc) should be ignored by group pin
            const pinnableVariants = variants.filter(v => !v.offerStatus || v.offerStatus === 'Draft');

            if (pinnableVariants.length === 0) {
                // Nothing to toggle (all are locked/post-draft)
                return;
            }

            // Check if all pinnable are currently pinned
            const allPinned = pinnableVariants.every(v => this.pinnedItems[v.sku] && this.pinnedItems[v.sku].isPinned);

            if (allPinned) {
                // Unpin all pinnable
                pinnableVariants.forEach(v => {
                    if (this.pinnedItems[v.sku]) {
                        const item = this.pinnedItems[v.sku];
                        item.isPinned = false;
                        if (!item.offerStatus || item.offerStatus === 'Draft') {
                            delete this.pinnedItems[v.sku];
                        }
                    }
                });
            } else {
                // Pin all pinnable (that aren't already pinned)
                pinnableVariants.forEach(v => {
                    if (!this.pinnedItems[v.sku]) {
                        this.pinnedItems[v.sku] = {
                            sku: v.sku,
                            group_id: groupId,
                            model: groupModel.get('model'),
                            manufacturer: groupModel.get('manufacturer'),
                            description: ((v.color || '') + ' ' + (v.network || '')).trim(),
                            grade: v.grade || groupModel.get('grade'),
                            warehouse: v.warehouse || groupModel.get('warehouse'),
                            qty: v.offerQty || 0,
                            price: v.offerPrice || 0,
                            submittedQty: v.offerQty || 0,
                            submittedPrice: v.offerPrice || 0,
                            counterQty: v.counterQty || 0,
                            counterPrice: v.counterPrice || 0,
                            availableQty: v.quantity,
                            listPrice: v.price,
                            offerStatus: v.offerStatus,
                            isPinned: true
                        };
                    } else {
                        // If it exists but is unpinned (active offer), set isPinned = true
                        this.pinnedItems[v.sku].isPinned = true;
                    }
                });
            }
            this.save();
            this.triggerUpdate();
        },

        isPinned: function (sku) {
            // It's checked if it exists AND is pinned
            return this.pinnedItems[sku] && this.pinnedItems[sku].isPinned;
        },

        // Returns: 'all', 'some', 'none'
        getGroupState: function (groupModel) {
            const variants = groupModel.get('variants') || [];
            if (variants.length === 0) return 'none'; // Should not happen

            // Filter for pinnable variants only
            const pinnableVariants = variants.filter(v => !v.offerStatus || v.offerStatus === 'Draft');

            if (pinnableVariants.length === 0) return 'none';

            const pinnedCount = pinnableVariants.filter(v => this.pinnedItems[v.sku] && this.pinnedItems[v.sku].isPinned).length;

            if (pinnedCount === pinnableVariants.length) return 'all';
            if (pinnedCount > 0) return 'some';
            return 'none';
        },

        save: function () {
            localStorage.setItem('offerBuilderState', JSON.stringify(this.pinnedItems));
        },

        clearAll: function () {
            this.pinnedItems = {};
            this.save();
            this.triggerUpdate();
        },

        triggerUpdate: function () {
            Backbone.trigger('offerBuilder:update');
        },

        // Import active offers from the stock collection
        importActiveOffers: function (variants) {
            let addedCount = 0;
            variants.forEach(v => {
                // If it has an active status (not empty, not Draft)
                // Normalize status check: ensure it matches what mock data produces ('Pending', 'Countered', 'Accepted', 'Rejected', 'In Cart')
                if (v.offerStatus && v.offerStatus !== 'Draft') {
                    // Normalize submitted values if missing (assume they match current if active)
                    const submittedQty = v.submittedQty !== undefined ? v.submittedQty : (v.offerQty || 0);
                    const submittedPrice = v.submittedPrice !== undefined ? v.submittedPrice : (v.offerPrice || 0);

                    // Start tracking it if not already tracked
                    if (!this.pinnedItems[v.sku]) {
                        this.pinnedItems[v.sku] = {
                            sku: v.sku,
                            group_id: v.group_id, // Ensure this is available on variant
                            model: v.model,
                            manufacturer: v.manufacturer,
                            description: v.description || ((v.color || '') + ' ' + (v.network || '')).trim(),
                            grade: v.grade,
                            warehouse: v.warehouse,
                            qty: v.offerQty || 0,
                            price: v.offerPrice || 0,
                            submittedQty: submittedQty,
                            submittedPrice: submittedPrice,
                            counterQty: v.counterQty || 0,
                            counterPrice: v.counterPrice || 0,
                            availableQty: v.quantity,
                            listPrice: v.price,
                            offerStatus: v.offerStatus,
                            isPinned: false // Important: It is active but NOT selected by user
                        };
                        addedCount++;
                    } else {
                        // Optional: Update status if exists? 
                        // For now, let's assume local state takes precedence if it exists.
                    }
                }
            });

            if (addedCount > 0) {
                console.log(`Imported ${addedCount} active offers from stock data.`);
                this.save();
                this.triggerUpdate();
            }
        }
    };

    // --- Offer Bar View (Sticky Footer) ---
    const OfferBarView = Backbone.View.extend({
        el: '#offer-bar',

        events: {
            'click .btn-view-pinned': 'openPinnedView',
            'click .btn-view-active': 'openActiveView',
            'click .offer-bar-menu-btn': 'toggleMenu',
            'click .action-clear-pinned': 'clearPinned'
        },

        initialize: function () {
            this.listenTo(Backbone, 'offerBuilder:update', this.render);

            // Close menu when clicking outside
            $(document).on('click', (e) => {
                if (!this.$(e.target).closest('.offer-bar-menu-container').length) {
                    this.$('.offer-bar-menu-container').removeClass('open');
                }
            });

            // Initial render
            this.render();
        },

        render: function () {
            const allItems = Object.values(OfferBuilderState.pinnedItems);

            // Count Pinned
            const pinnedCount = allItems.filter(item => item.isPinned).length;

            // Count Active (Post-Draft)
            const activeCount = allItems.filter(item => item.offerStatus && item.offerStatus !== 'Draft').length;

            console.log('Bar Render: Pinned=', pinnedCount, 'Active=', activeCount);

            // Update Badge Text
            this.$('.pinned-count').text(pinnedCount);
            this.$('.active-count').text(activeCount);

            if (pinnedCount > 0 || activeCount > 0) {
                this.$el.addClass('visible');
            } else {
                this.$el.removeClass('visible');
            }
        },

        openPinnedView: function (e) {
            e.preventDefault();
            Backbone.trigger('offerDrawer:open', 'pinned');
        },

        openActiveView: function (e) {
            e.preventDefault();
            Backbone.trigger('offerDrawer:open', 'active');
        },

        toggleMenu: function (e) {
            e.preventDefault();
            e.stopPropagation();
            this.$('.offer-bar-menu-container').toggleClass('open');
        },

        clearPinned: function (e) {
            e.preventDefault();
            // Close menu
            this.$('.offer-bar-menu-container').removeClass('open');

            // Unpin all logic...
            const items = OfferBuilderState.pinnedItems;
            Object.keys(items).forEach(sku => {
                const item = items[sku];
                if (item.isPinned) {
                    item.isPinned = false;
                    // If it's just a draft (not sent), we can remove it entirely when unpinned
                    if (!item.offerStatus || item.offerStatus === 'Draft') {
                        delete items[sku];
                    }
                }
            });

            OfferBuilderState.save();
            OfferBuilderState.triggerUpdate();
        }
    });

    // --- Offer Drawer View ---
    const OfferDrawerView = Backbone.View.extend({
        el: '#offer-drawer',
        groupTemplate: _.template($('#offer-group-template').html()),
        variantTemplate: _.template($('#offer-variant-template').html()),

        events: {
            'click .drawer-close-btn': 'closeDrawer',
            'click .drawer-close-btn': 'closeDrawer',
            'click .offer-item-unpin': 'showUnpinConfirmation',
            'click .confirm-unpin': 'confirmUnpin',
            'click .cancel-unpin': 'hideUnpinConfirmation',
            'change .control-input': 'updateItemState',
            'change .control-input': 'updateItemState',
            'keyup .control-input': 'updateItemState',
            'click .control-input': 'autoSelect',
            'focus .control-input': 'autoSelect',
            'keydown .control-input': 'handleInputKeydown',
            'click .btn-generate-xlsx': 'generateXLSX',
            'click .btn-reset-demo-data': 'resetDemoData',
            'click #drawer-menu-btn': 'toggleMenu',
            'click .btn-place-offer': 'placeOffers',
            'click .btn-group-action.remove': 'removeGroup',
            'click .btn-group-action.add-all': 'addAllInGroup',
            'click .variant-menu-btn': 'toggleVariantMenu',
            'click .action-view-cart': 'viewInCart',
            'click .action-view-cart': 'viewInCart',
            'click .action-cancel-offer': 'cancelOffer',
            'click .add-to-cart-action': 'handleMenuAddToCart',
            'click .action-add-to-cart-menu': 'handleMenuAddToCart',
            'click .view-tab': 'switchView'
        },

        viewMode: 'pinned', // 'pinned' (was selected) or 'active'

        initialize: function () {
            this.listenTo(Backbone, 'offerBuilder:update', this.render);
            this.listenTo(Backbone, 'offerDrawer:open', this.openDrawer);

            // Backdrop click handler
            $('.drawer-backdrop').on('click', () => {
                this.closeDrawer();
            });

            $(document).on('click', (e) => {
                const $target = $(e.target);

                // Close overflow menus if clicked outside
                if (!$target.closest('.overflow-menu-container').length) {
                    this.$('#drawer-overflow-menu').removeClass('open');
                }
                if (!$target.closest('.variant-menu-container').length) {
                    this.$('.variant-overflow-menu').removeClass('open');
                }
            });
        },

        switchView: function (e) {
            const btn = $(e.currentTarget);
            const view = btn.data('view');
            if (view === this.viewMode) return;

            this.viewMode = view;
            // Update tabs UI
            this.$('.view-tab').removeClass('active');
            btn.addClass('active');

            this.render();
        },

        openDrawer: function (viewMode) {
            this.$el.addClass('open');
            $('.drawer-backdrop').addClass('visible');
            $('body').css('overflow', 'hidden');

            if (viewMode) {
                this.viewMode = viewMode;
                // Update tabs UI to match
                this.$('.view-tab').removeClass('active');
                this.$(`.view-tab[data-view="${viewMode}"]`).addClass('active');
            }

            // Re-render to ensure view is consistent
            this.render();
        },

        render: function () {
            const listContainer = this.$('.offer-item-list');
            listContainer.empty();

            // Get all items
            const allItems = Object.values(OfferBuilderState.pinnedItems);

            // Calculate Counts for Tabs
            const pinnedCount = allItems.filter(item => item.isPinned).length;
            const activeCount = allItems.filter(item => item.offerStatus && item.offerStatus !== 'Draft').length;

            console.log('Drawer Render: Pinned=', pinnedCount, 'Active=', activeCount);

            // Update Tab Badges
            this.$('.view-tab[data-view="pinned"] .badge').text(pinnedCount);
            this.$('.view-tab[data-view="active"] .badge').text(activeCount);

            // Filter based on viewMode
            let items = [];
            if (this.viewMode === 'pinned') {
                // Show pinned items
                items = allItems.filter(item => item.isPinned);
            } else if (this.viewMode === 'active') {
                // Show items with active status (not Draft)
                items = allItems.filter(item => item.offerStatus && item.offerStatus !== 'Draft');
            }

            if (items.length === 0) {
                const emptyMsg = this.viewMode === 'pinned'
                    ? 'No pinned items.'
                    : 'No active offers.';
                listContainer.html(`<div class="text-center text-muted" style="padding: 20px;">${emptyMsg}</div>`);
                this.$('.offer-total-amount').text('$0.00');
                this.$('.btn-place-offer').prop('disabled', true);
                return;
            }

            const groups = _.groupBy(items, (item) => {
                return `${item.manufacturer || ''}|${item.model || ''}|${item.grade || ''}|${item.warehouse || ''}`;
            });
            let totalValue = 0;
            let hasValidOffer = false;

            Object.keys(groups).forEach(groupKey => {
                const groupItems = groups[groupKey];
                const firstItem = groupItems[0];

                // Aggregate unique attributes for badges (should be single now due to grouping)
                const uniqueGrades = new Set();
                const uniqueWarehouses = new Set();
                let capacity = '';

                groupItems.forEach(i => {
                    if (i.grade) uniqueGrades.add(i.grade);
                    if (i.warehouse) uniqueWarehouses.add(i.warehouse);
                    if (!capacity && i.description) {
                        const matches = i.description.match(/\d+GB|\d+TB/);
                        if (matches) capacity = matches[0];
                    }
                });

                // Fallback for capacity if not found in description but in model name
                if (!capacity && firstItem.model) {
                    const matches = firstItem.model.match(/\d+GB|\d+TB/);
                    if (matches) capacity = matches[0];
                }

                const $groupEl = $(this.groupTemplate({
                    groupKey: groupKey, // Pass composite key
                    groupId: firstItem.group_id || 'misc',
                    manufacturer: firstItem.manufacturer || '',
                    model: firstItem.model || 'Other', // Display Name
                    capacity: capacity || '',
                    grades: Array.from(uniqueGrades),
                    warehouses: Array.from(uniqueWarehouses)
                }));

                const $variantsContainer = $groupEl.find('.offer-group-variants');
                if ($variantsContainer.length === 0) {
                    console.error('Could not find .offer-group-variants in template result');
                }

                groupItems.forEach(item => {
                    item.qty = item.qty || 1;
                    const offerPrice = item.price ? item.price : '';
                    if (offerPrice && offerPrice > 0) hasValidOffer = true;

                    // Use stored status or default to Draft
                    item.status = item.offerStatus || 'Draft';

                    // Determine if unsubmitted changes exist
                    // 1. Draft: Always true (unless maybe empty? but user said "unsubmitted info", implies we want to submit it)
                    //    Actually user said "unsubmitted offer info". If it's a blank draft, maybe not?
                    //    But "Place Offers" button logic considers valid drafts.
                    //    Let's say Draft is always "unsubmitted" until it becomes Pending.
                    // 2. Others: Only if edited.

                    let hasUnsubmitted = false;
                    if (item.status === 'Draft' || !item.status) {
                        // Only show if it has potentially valid data (Price > 0, Qty > 0)
                        // Matches "Place Offer" button logic
                        // User feedback: "still have 1 unit at $0... is not a valid offer value" = NO DOT.
                        const p = parseFloat(offerPrice || 0);
                        const q = parseInt(item.qty || 0);
                        if (p > 0 && q > 0) {
                            hasUnsubmitted = true;
                        }
                    } else if (item.status !== 'In Cart' && item.status !== 'Accepted') {
                        // Check for edits from submitted snapshot
                        if (item.qty !== (item.submittedQty || 0) || Math.abs((item.price || 0) - (item.submittedPrice || 0)) > 0.005) {
                            hasUnsubmitted = true;
                        }
                    }

                    const $variantEl = $(this.variantTemplate({
                        sku: item.sku,
                        model: item.model,
                        grade: item.grade || '',
                        description: item.description || item.grade,
                        qty: item.qty,
                        availableQty: item.availableQty || 999, // Match stored property
                        price: offerPrice,
                        submittedQty: item.submittedQty || 0,
                        submittedPrice: item.submittedPrice || 0,
                        counterQty: item.counterQty || 0,
                        counterPrice: item.counterPrice || 0,
                        listPrice: (item.listPrice || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), // Match stored property
                        status: item.status,
                        hasUnsubmittedChanges: hasUnsubmitted,
                        totalPromise: (item.qty * (item.price || 0)) // We can just do logic in template or calc here. 
                        // Actually template doesn't have total param, so we need to add it or let JS init it.
                        // Let's add it via logic after append or just rely on render.
                        // Simplest: pass it to template? No, template needs modification. 
                        // Wait, I updated HTML to include span. I need to populate it.
                        // I'll populate it right after creating element.
                    }));

                    const initialTotal = item.qty * (item.price || 0);
                    $variantEl.find('.item-total').html(this.formatMoneyHTML(initialTotal));

                    this.validateAndShowFeedback($variantEl);

                    $variantsContainer.append($variantEl);

                    if (item.price) {
                        totalValue += (item.qty * item.price);
                    }
                });

                listContainer.append($groupEl);
            });

            // Update total value based on ALL items
            this.updateTotalValue(items);

        },

        closeDrawer: function () {
            this.$el.removeClass('open');
            $('.drawer-backdrop').removeClass('visible');
            $('body').css('overflow', '');
            this.$('#drawer-overflow-menu').removeClass('open');
        },

        toggleMenu: function (e) {
            e.stopPropagation();
            this.$('#drawer-overflow-menu').toggleClass('open');
        },

        removeGroup: function (e) {
            e.stopPropagation(); // Prevent bubbling
            const groupKey = $(e.currentTarget).closest('.offer-group').data('group-key');
            console.log('Removing group:', groupKey);

            if (!groupKey) return;

            const [mfr, model, grade, warehouse] = groupKey.split('|');

            // Find all items matching this group key
            const items = Object.values(OfferBuilderState.pinnedItems);
            let removedCount = 0;

            items.forEach(item => {
                const itemKey = `${item.manufacturer || ''}|${item.model || ''}|${item.grade || ''}|${item.warehouse || ''}`;
                if (itemKey === groupKey) {
                    delete OfferBuilderState.pinnedItems[item.sku];
                    removedCount++;
                }
            });

            console.log(`Removed ${removedCount} items from group ${groupKey}`);
            OfferBuilderState.save();
        },

        addAllInGroup: function (e) {
            e.stopPropagation();
            const groupKey = $(e.currentTarget).closest('.offer-group').data('group-key');
            console.log('Adding all for group:', groupKey);

            if (window.stockCollection) {
                const [mfr, modelName, grade, warehouse] = groupKey.split('|');

                // Filter items that match the group attributes
                // Note: stockCollection contains Group Models, not variants roughly. 
                // Wait, stockCollection models HAVE variants. We need to find the correct group model and then add all its variants?
                // The Stock List groups by Model+Grade+Warehouse basically (actually manufacturer|model|capacity|grade|warehouse).
                // Our groupKey in offer drawer is manufacturer|model|grade|warehouse. 
                // Let's find matches in the Mock Data structure.

                let addedCount = 0;

                window.stockCollection.each(groupModel => {
                    const gm = groupModel.toJSON();
                    // Check if group model matches our target attributes
                    // Note: Mock data structure might be slightly different so loosen match if needed
                    // But usually stock list groups ARE these attributes.
                    if ((gm.model === modelName) &&
                        (gm.grade === grade) &&
                        (gm.warehouse === warehouse)) {

                        // Add all variants in this group
                        (gm.variants || []).forEach(v => {
                            const attrs = {
                                sku: v.sku,
                                manufacturer: gm.manufacturer,
                                model: gm.model,
                                grade: gm.grade,
                                warehouse: gm.warehouse,
                                description: ((v.color || '') + ' ' + (v.network || '')).trim(),
                                qty: v.offerQty || 0,
                                price: v.offerPrice || 0,
                                availableQty: v.quantity,
                                listPrice: v.price,
                                offerStatus: v.offerStatus
                            };

                            if (!OfferBuilderState.pinnedItems[attrs.sku]) {
                                OfferBuilderState.pinnedItems[attrs.sku] = attrs;
                                addedCount++;
                            }
                        });
                    }
                });

                console.log(`Added ${addedCount} items to group ${groupKey}`);
                OfferBuilderState.save();
            } else {
                console.error('StockCollection not found');
                alert('Cannot access stock data to add items.');
            }

        },

        resetDemoData: function (e) {
            if (e) e.preventDefault();
            this.$('#drawer-overflow-menu').removeClass('open');

            if (confirm("Are you sure you want to reset all offer demo data? This will clear your current offers and generate new random statuses for items.")) {

                // 1. Clear locally pinned items completely
                OfferBuilderState.clearAll();

                // 2. Reset the mock server data and get all generated offers
                if (window.MockApi && window.MockApi.resetDemoData) {
                    const allVariants = window.MockApi.resetDemoData();

                    // Manually populate group details for the variants based on ALL_DATA
                    // (The import method expects manufacturer, model, etc.)
                    // Actually, MockApi's returned variants should probably have this info
                    // Let's just pass them directly, importActiveOffers will save them.
                    OfferBuilderState.importActiveOffers(allVariants);
                }

                // 3. Re-fetch stock data to update the UI paginated view
                if (window.stockCollection) {
                    window.stockCollection.fetch({ reset: true });
                }
            }
        },

        showUnpinConfirmation: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const btn = $(e.currentTarget);

            // Close other popovers
            this.$('.offer-item-unpin').not(btn).popover('destroy');
            btn.popover('destroy');

            btn.popover({
                html: true,
                placement: 'bottom',
                trigger: 'manual',
                container: '#offer-drawer',
                content: `<div style="padding: 5px; text-align: center;">
                            <div style="margin-bottom: 8px; font-size: 13px; font-weight: 600;">Unpin this item?</div>
                            <div style="display: flex; gap: 8px; justify-content: center;">
                                <button class="btn btn-sm btn-default cancel-unpin">Cancel</button>
                                <button class="btn btn-sm btn-primary confirm-unpin">Unpin</button>
                            </div>
                          </div>`
            });

            btn.popover('show');

            const closePopover = (ev) => {
                if (!$(ev.target).closest('.popover').length && !$(ev.target).closest('.offer-item-unpin').length) {
                    btn.popover('destroy');
                    $(document).off('click', closePopover);
                }
            };
            setTimeout(() => { $(document).on('click', closePopover); }, 0);
        },

        hideUnpinConfirmation: function (e) {
            e.preventDefault();
            this.$('.offer-item-unpin').popover('destroy');
        },

        confirmUnpin: function (e) {
            e.preventDefault();
            e.stopPropagation();
            // The popover is attached to the button, but the button content is static HTML string in popover options?
            // Wait, standard bootstrap popover content doesn't maintain reference to original button easily inside the content events unless we start searching.
            // Actually, because we are using event delegation in Backbone View (`events`), `e.currentTarget` is the button inside the popover.
            // BUT we need to know WHICH item to unpin. 
            // The popover is detached from the row in generated HTML. 
            // We can resolve this by:
            // 1. Storing data on the popover content elements?
            // 2. Or tracking the "active unpin button" in the view state?
            // Let's go with finding the open popover's trigger? Hard.
            // Easier: Attach data to the buttons in the popover HTML string when creating it.

            // Re-visiting showUnpinConfirmation to inject SKU.
            // We need to find the SKU from the clicked .offer-item-unpin button.
            // But wait, `confirmUnpin` is called when clicking "Unpin" INSIDE the popover.
            // We don't have reference to `btn` here directly.

            // Let's modify showUnpinConfirmation to include data-sku in the confirm button.
        },

        // Re-implementing correctly below:

        showUnpinConfirmation: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const btn = $(e.currentTarget);
            const sku = btn.closest('.offer-variant-row').data('sku');

            this.$('.offer-item-unpin').not(btn).popover('destroy');
            btn.popover('destroy');

            btn.popover({
                html: true,
                placement: 'bottom',
                trigger: 'manual',
                container: '#offer-drawer',
                content: `<div style="padding: 5px; text-align: center;">
                            <button class="btn btn-sm btn-primary confirm-unpin" data-sku="${sku}" style="width: 100%;">UNPIN ITEM</button>
                          </div>`
            });

            btn.popover('show');

            const closePopover = (ev) => {
                if (!$(ev.target).closest('.popover').length && !$(ev.target).closest('.offer-item-unpin').length) {
                    btn.popover('destroy');
                    $(document).off('click', closePopover);
                }
            };
            setTimeout(() => { $(document).on('click', closePopover); }, 0);
        },

        confirmUnpin: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const btn = $(e.currentTarget);
            const sku = btn.data('sku');

            if (sku) {
                OfferBuilderState.togglePin({ sku: sku });
            }

            $('.popover').remove(); // Close all
        },

        updateItemState: function (e) {
            const input = $(e.currentTarget);
            const row = input.closest('.offer-variant-row');
            const sku = row.data('sku');

            let qty = parseInt(row.find('.qty').val());
            let priceVal = row.find('.price').val();
            let price = parseFloat(priceVal);

            if (isNaN(qty) || qty < 1) qty = 1;

            // Handle keyup for real-time visual updates (if needed) but do NOT save/render
            if (e.type === 'keyup') {
                if (!isNaN(price) && price >= 0) {
                    // We could manually update line total here if we want instant feedback
                    // const total = qty * price;
                    // row.find('.line-total').text('$' + total.toLocaleString(...));
                }
                return;
            }

            if (OfferBuilderState.pinnedItems[sku]) {
                const itemData = OfferBuilderState.pinnedItems[sku];

                const validated = this.validateAndShowFeedback(row);
                if (validated) {
                    if (validated.price !== undefined) price = validated.price;
                    if (validated.qty !== undefined) qty = validated.qty;
                }

                this.checkEditedStatus(row, qty, price);

                // --- End Validation Logic ---

                itemData.qty = qty;

                if (!isNaN(price) && price >= 0) {
                    itemData.price = price;
                } else if (priceVal === '') {
                    itemData.price = null;
                }

                OfferBuilderState.save();
                this.updateFooterTotal(); // Targeted update instead
            }

            // Update local item total display
            if (!isNaN(price) && price >= 0) {
                const total = qty * price;
                row.find('.item-total').html(this.formatMoneyHTML(total));
            } else {
                row.find('.item-total').html(this.formatMoneyHTML(0));
            }
        },

        autoSelect: function (e) {
            $(e.currentTarget).select();
        },

        handleInputKeydown: function (e) {
            if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault();
                const $inputs = this.$('.control-input:visible');
                const currentIndex = $inputs.index(e.currentTarget);
                const nextIndex = currentIndex + 1;

                if (nextIndex < $inputs.length) {
                    const $nextInput = $inputs.eq(nextIndex);
                    $nextInput.focus();
                    $nextInput.select();
                }
            }
        },

        updateTotalDisplay: function () {
            // Deprecated by full re-render on save() to update line totals, 
            // but kept if we switch to lighter update
            this.render();
        },

        updateFooterTotal: function () {
            const items = Object.values(OfferBuilderState.pinnedItems);
            // Delegate to the main logic which handles button state too
            this.updateTotalValue(items);
        },

        placeOffers: function () {
            const items = OfferBuilderState.pinnedItems;
            let count = 0;

            Object.values(items).forEach(item => {
                const price = parseFloat(item.price || 0);
                const qty = parseInt(item.qty || 0);
                const submittedQty = parseInt(item.submittedQty || 0);
                const submittedPrice = parseFloat(item.submittedPrice || 0);
                const status = item.offerStatus || 'Draft';

                let isActionable = false;

                // 1. New Offer (Draft)
                if (status === 'Draft' || !item.offerStatus) {
                    if (qty > 0 && price > 0) {
                        isActionable = true;
                    }
                }
                // 2. Existing Offer (Edited)
                else if (status !== 'In Cart' && status !== 'Accepted') {
                    if (qty !== submittedQty || Math.abs(price - submittedPrice) > 0.005) {
                        isActionable = true;
                    }
                }

                if (isActionable) {
                    // Update status and snapshots
                    item.offerStatus = 'Pending';
                    item.submittedQty = qty;
                    item.submittedPrice = price;
                    // Ensure it's marked as pinned (though it should be if we are here, unless we support submitting unpinned items?)
                    // If it was unpinned but active, and we edit+submit, it stays unpinned (Active tab) but updates values.

                    count++;
                }
            });

            if (count > 0) {
                OfferBuilderState.save();
                this.render(); // Re-render to show new statuses
                alert(`Successfully placed offers for ${count} items!`);
                this.closeDrawer();

                // Trigger global update so Stock List icons/badges update
                OfferBuilderState.triggerUpdate();
            } else {
                alert('No valid offers to place.');
            }
        },

        onSearchInput: function () {
            this.render();
            // Focus is maintained by browser usually, but strict re-render might lose it if input is inside?
            // Wait, input is NOT inside .offer-item-list, it serves as header. So focus is safe.
        },

        // updateTotalValue: function (items) { ... } // Replaced by updateFooterTotal or kept as helper?
        // We can keep updateTotalValue or just use updateFooterTotal. 
        // Let's replace the existing updateTotalValue which was used in render()
        // Wait, render() calls updateTotalValue(items). We should update render to use updateFooterTotal or keep it consistent.
        // Actually, render passes items. Let's make updateFooterTotal get items from state if not passed, or just use state.
        // The implementation above pulls from state directly.



        formatMoneyHTML: function (amount) {
            const val = parseFloat(amount || 0);
            const str = val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            const parts = str.split('.');
            return `<span class="dollars">$${parts[0]}</span><span class="cents">.${parts[1]}</span>`;
        },

        toggleVariantMenu: function (e) {
            e.stopPropagation();
            // Close others
            $('.variant-overflow-menu').not($(e.currentTarget).next()).removeClass('open');
            $(e.currentTarget).next('.variant-overflow-menu').toggleClass('open');
        },

        viewInCart: function (e) {
            alert('View in Cart clicked (Mock)');
            $(e.currentTarget).closest('.variant-overflow-menu').removeClass('open');
        },

        cancelOffer: function (e) {
            // Mock cancel
            if (confirm('Are you sure you want to cancel this offer?')) {
                const sku = $(e.currentTarget).closest('.offer-variant-row').data('sku');
                // In real app, we would call API. For now, just remove from pinned items
                if (sku) {
                    OfferBuilderState.togglePin({ sku: sku });
                }
            }
        },

        showAcceptConfirmation: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const btn = $(e.currentTarget);

            // Close other popovers
            this.$('.accept-counter-offer').not(btn).popover('destroy');

            // If this one is already open, toggling it by destroy might be what we want, or just return.
            // But let's just destroy and re-create to be safe.
            btn.popover('destroy');

            const sku = btn.data('sku');
            const itemData = OfferBuilderState.pinnedItems[sku];
            const counterQty = itemData.counterQty || 0;
            const counterPrice = itemData.counterPrice || 0;
            const formattedPrice = counterPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            btn.popover({
                html: true,
                placement: 'bottom', // Bottom might be better for a link dropping down
                trigger: 'manual',
                container: '#offer-drawer',
                content: `<div style="padding: 5px 10px;">
                            <a href="#" class="confirm-accept" data-sku="${sku}" style="font-weight:bold; color:#2196f3; text-decoration:none;">
                                Accept: ${counterQty} @ $${formattedPrice}
                            </a>
                          </div>`
            });

            btn.popover('show');

            // Handle click outside to close
            const closePopover = (ev) => {
                // If click is NOT inside a popover and NOT on the button itself
                if (!$(ev.target).closest('.popover').length && !$(ev.target).closest('.accept-counter-offer').length) {
                    btn.popover('destroy');
                    $(document).off('click', closePopover);
                }
            };

            // Delay adding the listener slightly so the current click doesn't trigger it immediately? 
            // In theory stopPropagation above handles the current click.
            setTimeout(() => {
                $(document).on('click', closePopover);
            }, 0);
        },

        hideAcceptConfirmation: function (e) {
            e.preventDefault();
            // Destroy all to be safe and clean up DOM
            this.$('.accept-counter-offer').popover('destroy');
        },

        acceptCounterOffer: function (e) {
            e.preventDefault();
            e.stopPropagation(); // Prevent bubbling to document which closes drawer
            // Since popover is now in this.$el, event delegation works.
            // But we need to find the sku from the BUTTON, not the link (which is arguably hidden or not currentTarget)
            const sku = $(e.currentTarget).data('sku');

            if (OfferBuilderState.pinnedItems[sku]) {
                // Update to counter values
                itemData.qty = itemData.counterQty;
                itemData.price = itemData.counterPrice;
                itemData.offerStatus = 'In Cart';

                // Update submitted snapshots so "Edited" doesn't show (clean slate)
                itemData.submittedQty = itemData.counterQty;
                itemData.submittedPrice = itemData.counterPrice;

                OfferBuilderState.save();
                this.render(); // Re-render to show updated state and remove popover
            }

            // Clean up any remaining popovers (rendering might have removed elements but not popover containers if detached)
            $('.popover').remove();
        },

        handleMenuAddToCart: function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Close the menu
            this.$('.variant-overflow-menu').removeClass('open');

            const btn = $(e.currentTarget);
            // The menu item is inside the overflow menu which is inside .variant-menu-container inside .variant-offer-controls-row inside .offer-variant-row
            // We need to find the variant row to get the SKU, OR we can attach SKU to the menu item in the template?
            // Let's check the template. The template renders the menu item. We can't easily get SKU from `closest('.offer-variant-row')` 
            // because the menu might be appended to body or positioned absolutely? 
            // In this prototype, `.variant-overflow-menu` is inside `.variant-menu-container` which is inside `.variant-offer-controls-row`.
            // So closest should work.
            const row = btn.closest('.offer-variant-row');
            const sku = row.data('sku');
            const actionType = btn.data('action-type'); // 'list', 'counter', 'accepted'

            if (OfferBuilderState.pinnedItems[sku]) {
                const itemData = OfferBuilderState.pinnedItems[sku];

                if (actionType === 'list') {
                    // Set to List Price
                    // User wants to add to cart at List Price (ignoring offer history? or resetting it?)
                    // "Add to Cart" implies moving to "In Cart" status.
                    itemData.qty = itemData.qty || 1; // Default to 1 if 0? Or keep current qty?
                    // Let's keep current qty if > 0, else 1
                    if (!itemData.qty) itemData.qty = 1;

                    itemData.price = itemData.listPrice;
                } else if (actionType === 'counter') {
                    itemData.qty = itemData.counterQty;
                    itemData.price = itemData.counterPrice;
                } else if (actionType === 'accepted') {
                    // Should be existing submitted values
                    // But let's ensure we use them
                    itemData.qty = itemData.submittedQty;
                    itemData.price = itemData.submittedPrice;
                }

                // Update status
                itemData.offerStatus = 'In Cart';

                // Update snapshots to avoid "Edited" flag since we are committing to this state
                itemData.submittedQty = itemData.qty;
                itemData.submittedPrice = itemData.price;

                OfferBuilderState.save();
                this.render();
            }
        },

        updateTotalValue: function (items) {
            let total = 0;
            let enablePlaceOffer = false;
            let editCount = 0;

            items.forEach(item => {
                const price = parseFloat(item.price || 0);
                const qty = parseInt(item.qty || 0);
                const submittedQty = parseInt(item.submittedQty || 0);
                const submittedPrice = parseFloat(item.submittedPrice || 0);
                const status = item.offerStatus || 'Draft';

                if (!isNaN(price) && !isNaN(qty)) {
                    total += price * qty;
                }

                // Logic for enabling button:
                // 1. New Offer (Draft): Needs valid Qty > 0 and Price >= 0.
                if (status === 'Draft' || !item.offerStatus) {
                    // Start disabled until user enters a valid Price > 0
                    if (qty > 0 && price > 0) {
                        enablePlaceOffer = true;
                        editCount++;
                    }
                }
                // 2. Existing Offer (Pending, Countered, etc.): Only if changed.
                // 3. Accepted/In Cart: Should not trigger "Place Offer" unless we want to allow re-submission?
                //    Usually these are 'done'. So if status is 'In Cart', it doesn't contribute to enabling.
                else if (status !== 'In Cart' && status !== 'Accepted') {
                    // Check if values have changed from submitted snapshot
                    if (qty !== submittedQty || Math.abs(price - submittedPrice) > 0.005) {
                        enablePlaceOffer = true;
                        editCount++;
                    }
                }
            });

            this.$('.offer-total-amount').text('$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

            const $btn = this.$('.btn-place-offer');
            $btn.prop('disabled', !enablePlaceOffer);

            // Update badge
            const $badge = $btn.find('.badge');
            if (editCount > 0) {
                $badge.text(editCount).show();
            } else {
                $badge.hide();
            }
        },

        validateAndShowFeedback: function (row) {
            const sku = row.data('sku');
            if (!OfferBuilderState.pinnedItems[sku]) return;

            const itemData = OfferBuilderState.pinnedItems[sku];
            const qty = parseInt(row.find('.qty').val());
            const priceVal = row.find('.price').val();
            let price = parseFloat(priceVal);

            // Quantity Validation
            const availQty = itemData.availableQty || 999;
            const qtyInput = row.find('.control-input.qty');
            const qtyHelper = qtyInput.siblings('.helper-text');

            if (qty > availQty) {
                qtyInput.addClass('warning').attr('title', `Quantity exceeds available stock (${availQty})`);
                qtyHelper.addClass('warning');
            } else {
                qtyInput.removeClass('warning').removeAttr('title');
                qtyHelper.removeClass('warning');
            }

            // Price Validation & Feedback
            // Price Validation & Feedback
            const listPrice = itemData.listPrice || 0;
            const priceInput = row.find('.control-input.price');
            const feedbackBadge = row.find('.feedback-badge');
            const feedbackCaption = row.find('.feedback-caption');
            const listPriceCaption = row.find('.static-list-price');

            // Reset classes
            priceInput.removeClass('buying offer warning');
            listPriceCaption.removeClass('buying');
            feedbackBadge.removeClass('visible muted offer buying').text('');
            feedbackCaption.removeClass('offer buying warning').text('');

            if (listPrice > 0) {
                if (price <= 0 || isNaN(price)) {
                    // No Offer - clear dynamic feedback, static list price is shown
                } else if (price > listPrice) {
                    // Cap at List Price
                    price = listPrice;
                    priceInput.val(price.toFixed(2)); // Auto-correct input

                    priceInput.addClass('buying');
                    listPriceCaption.addClass('buying');
                    feedbackBadge.addClass('visible buying').text('BUY AT LIST');
                    feedbackCaption.text('');
                } else if (price === listPrice) {
                    // Exact Match
                    priceInput.addClass('buying');
                    listPriceCaption.addClass('buying');
                    feedbackBadge.addClass('visible buying').text('BUY AT LIST');
                    feedbackCaption.text('');
                } else {
                    // Offer In
                    const diffPerUnit = listPrice - price;
                    const totalSavings = diffPerUnit * qty;

                    priceInput.addClass('offer'); // Green border
                    feedbackCaption.addClass('offer').text(`$${totalSavings.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} off List`);
                }
            }

            return { price: price, qty: qty };
        },

        checkEditedStatus: function (row, currentQty, currentPrice) {
            const qtyInput = row.find('.control-input.qty');
            const priceInput = row.find('.control-input.price');
            let hasChanges = false;


            // Get original submitted values (if any)
            const submittedQty = parseInt(qtyInput.data('submitted-val') || 0);
            const submittedPrice = parseFloat(priceInput.data('submitted-val') || 0);

            // If submitted values exist (meaning it's not a fresh Draft or unknown), compare
            // Note: If submittedQty is 0, it might be a Draft. Drafts can be edited without "Edited" label?
            // Requirement says: "WHEN Pending, Countered, Rejected, or Accepted... show Edited"
            // So we only show if data-submitted-val > 0

            if (submittedQty > 0) {
                if (currentQty !== submittedQty) {
                    qtyInput.siblings('.edited-label').show();
                    qtyInput.addClass('edited');
                    hasChanges = true;
                } else {
                    qtyInput.siblings('.edited-label').hide();
                    qtyInput.removeClass('edited');
                }
            }

            if (submittedPrice > 0) {
                // Float comparison tolerance
                if (Math.abs(currentPrice - submittedPrice) > 0.005) {
                    priceInput.siblings('.edited-label').show();
                    priceInput.addClass('edited');
                    hasChanges = true;
                } else {
                    priceInput.siblings('.edited-label').hide();
                    priceInput.removeClass('edited');
                }
            }

            // Toggle blue dot
            // Note: Draft items (submittedQty == 0) always have the dot via Main Render, 
            // but we might need to toggle it here if we want to support "clearing" a draft?
            // For now, let's assume Draft items ALWAYS have the dot, so we only toggle for non-drafts or based on "Edited" state?
            // User requirement: "mark items... with unsubmitted offer info".
            // If it's a Draft, it IS unsubmitted info.
            // If it's Pending/Countered, only if CHANGED.

            // Check status (we need data-status or something on the row, relying on submittedQty being > 0 implies non-draft usually)
            // But let's check class? No, status isn't class on row.
            // Use submittedQty: if 0, it's a Draft (or unsubmitted). If > 0, it's an existing offer.

            const dot = row.find('.unsubmitted-dot');

            if (submittedQty === 0) {
                // Draft: Show dot ONLY if current values are valid (Price > 0, Qty > 0)
                if (currentPrice > 0 && currentQty > 0) {
                    dot.show();
                } else {
                    dot.hide();
                }
            } else {
                // Existing: Show only if hasChanges
                if (hasChanges) {
                    dot.show();
                } else {
                    dot.hide();
                }
            }
        },

        generateXLSX: function () {
            const items = Object.values(OfferBuilderState.pinnedItems);
            // ... existing code ...
        }
    });

    const StockModel = Backbone.Model.extend({
        defaults: {
            description: '',
            grade: '',
            quantity: 0,
            price: 0,
            items: []
        }
    });

    const StockCollection = Backbone.Collection.extend({
        model: StockModel,

        // State for server-side processing
        state: {
            start: 0,
            length: 10, // Small page size for demo
            draw: 1,
            filters: {
                category: [],
                warehouse: [],
                manufacturer: [],
                model: [],
                grade: [],
                includeOos: false,
                search: ''
            }
        },

        initialize: function () {
            this.facets = {}; // To store filter counts from server
            this.totalRecords = 0;
        },

        // Override sync to talk to MockApi
        sync: function (method, model, options) {
            if (method === 'read') {
                const params = {
                    draw: this.state.draw++,
                    start: this.state.start,
                    length: this.state.length,
                    category: this.state.filters.category,
                    warehouse: this.state.filters.warehouse,
                    manufacturer: this.state.filters.manufacturer,
                    model: this.state.filters.model,
                    grade: this.state.filters.grade,
                    includeOos: this.state.filters.includeOos,
                    search: this.state.filters.search
                };

                // Simulate network latency
                setTimeout(() => {
                    try {
                        const response = window.MockApi.getGroups(params);
                        options.success(response);
                    } catch (e) {
                        console.error("Mock API Error:", e);
                        if (options.error) options.error(e);
                    }
                }, 300);
            }
        },

        parse: function (response) {
            this.facets = response.filter;
            this.totalRecords = response.recordsFiltered;
            return response.data;
        },

        // Helper to update filters
        updateFilter: function (type, value, isChecked) {
            if (type === 'oos') {
                this.state.filters.includeOos = isChecked;
            } else {
                let list = this.state.filters[type] || [];
                if (isChecked) {
                    list.push(value);
                } else {
                    list = list.filter(v => v !== value);
                }
                this.state.filters[type] = list;

                if (type === 'category' && !this.state.filters.category.includes('Phones')) {
                    this.state.filters.manufacturer = [];
                    this.state.filters.model = [];
                }
                if (type === 'manufacturer' && this.state.filters.manufacturer.length === 0) {
                    this.state.filters.model = [];
                }
            }
            this.state.start = 0; // Reset to page 1
            this.fetch();
        },

        updateSearch: function (term) {
            this.state.filters.search = term;
            this.state.start = 0;
            this.fetch();
        },

        nextPage: function () {
            if (this.state.start + this.state.length < this.totalRecords) {
                this.state.start += this.state.length;
                this.fetch();
            }
        },

        prevPage: function () {
            if (this.state.start > 0) {
                this.state.start -= this.state.length;
                this.fetch();
            }
        }
    });

    // --- Views ---

    const ActiveFiltersView = Backbone.View.extend({
        el: '#active-filters-container',

        events: {
            'click .remove-filter': 'removeFilter',
            'click .clear-all-filters': 'clearAll'
        },

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.render);
        },

        render: function () {
            this.$el.empty();
            const filters = this.collection.state.filters;
            let html = '';
            let hasFilters = false;

            // Helper to create chips
            const addChip = (label, type, value) => {
                html += `
                    <span class="label" style="display: inline-flex; align-items: center; margin-right: 5px; margin-bottom: 5px;">
                        ${label}: ${value} 
                        <span class="material-icons remove-filter" data-type="${type}" data-value="${value}">close</span>
                    </span>
                `;
                hasFilters = true;
            };

            if (filters.search) {
                addChip('Search', 'search', filters.search);
            }

            ['category', 'warehouse', 'manufacturer', 'model', 'grade'].forEach(type => {
                if (filters[type] && filters[type].length > 0) {
                    filters[type].forEach(val => {
                        addChip(type.charAt(0).toUpperCase() + type.slice(1), type, val);
                    });
                }
            });

            if (filters.includeOos) {
                // OOS is a toggle, not a list, but we can show it as a chip
                // html += ... 
                // Usually toggles are just toggles. Let's skip for now unless requested.
            }

            if (hasFilters) {
                html += `<button class="btn btn-link btn-xs clear-all-filters" style="vertical-align: sub;">Clear All</button>`;
                this.$el.html(html);
            }
        },

        removeFilter: function (e) {
            const type = $(e.currentTarget).data('type');
            const value = $(e.currentTarget).data('value');

            if (type === 'search') {
                $('#search-input').val('');
                this.collection.updateSearch('');
            } else {
                // Must uncheck the sidebar checkbox too - handled by collection update? 
                // Sidebar listens to sync so it will update.
                this.collection.updateFilter(type, value, false);
            }
        },

        clearAll: function () {
            // Reset all filters
            this.collection.state.filters = {
                category: [],
                warehouse: [],
                manufacturer: [],
                model: [],
                grade: [],
                includeOos: false,
                search: ''
            };
            $('#search-input').val(''); // Clear UI input
            this.collection.state.start = 0;
            this.collection.fetch();
        }
    });

    const StockListView = Backbone.View.extend({
        el: '#stock-list-container',
        template: _.template($('#product-card-template').html()),

        initialize: function (options) {
            this.modal = options.modal; // Reference to the modal view
            this.listenTo(this.collection, 'sync', this.render);
            this.listenTo(this.collection, 'request', this.showLoading);
            this.listenTo(this.collection, 'error', this.showError);
            this.listenTo(Backbone, 'offerBuilder:update', this.updatePinIcons);
        },

        showLoading: function () {
            this.$el.html('<div class="text-center" style="padding: 50px;"><div class="loader"></div><p class="text-muted" style="margin-top: 10px;">Loading stock data...</p></div>');
        },

        showError: function () {
            this.$el.html('<div class="alert alert-danger text-center"><h4>Error Loading Data</h4><p>Please try again later.</p></div>');
        },

        render: function () {
            this.$el.empty();

            // Handle No Results
            if (this.collection.length === 0) {
                const filters = this.collection.state.filters;
                let suggestionsHtml = '';

                // Smart Suggestions
                if (filters.search) {
                    suggestionsHtml += `<p>No items found for "<strong>${filters.search}</strong>".</p>`;
                }

                // Suggest removing specific filters
                const activeTypes = ['category', 'manufacturer', 'model', 'warehouse', 'grade'].filter(t => filters[t] && filters[t].length > 0);

                if (activeTypes.length > 0) {
                    suggestionsHtml += `<p>Try removing some filters:</p><ul>`;
                    activeTypes.forEach(type => {
                        filters[type].forEach(val => {
                            suggestionsHtml += `
                                <li>
                                    Remove ${type}: <strong>${val}</strong> 
                                    <button class="btn btn-default btn-xs remove-single-filter" data-type="${type}" data-value="${val}">Remove</button>
                                </li>`;
                        });
                    });
                    suggestionsHtml += `</ul>`;
                } else if (filters.search) {
                    suggestionsHtml += `<p>Try checking your spelling or using different keywords.</p>`;
                } else {
                    suggestionsHtml += `<p>No stock available.</p>`;
                }

                this.$el.html(`
                    <div class="alert alert-warning">
                        <h4>No results found</h4>
                        ${suggestionsHtml}
                        <div style="margin-top: 15px;">
                            <button class="btn btn-primary" id="reset-all-btn">Clear All Filters</button>
                        </div>
                    </div>
                `);
                return;
            }

            this.collection.each(model => {
                const data = model.toJSON();
                // Enrich variants with current OfferBuilderState (to get latest status/qty)
                if (data.variants) {
                    data.variants.forEach(v => {
                        const pinned = OfferBuilderState.pinnedItems[v.sku];
                        if (pinned) {
                            if (pinned.offerStatus) v.offerStatus = pinned.offerStatus;
                            if (pinned.submittedQty) v.submittedQty = pinned.submittedQty;
                            // Also ensure we have the latest quantity if it changed? (Usually stock qty comes from collection)
                        }
                    });
                }
                this.$el.append(this.template(data));
            });

            // Re-bind events for expanded content if needed
            this.updatePinIcons();
            return this;
        },

        events: {
            'click .card-header-row': 'toggleDetails',
            'click .btn-pin': 'toggleGroupPin',
            'click .btn-pin-variant': 'toggleVariantPin',
            'click .btn-buy': 'openBuyModal',
            'click .btn-offer': 'openOfferModal',
            'click .btn-offer-status': 'handleOfferStatusClick',
            'click #toggle-all-details': 'toggleAllDetails'
        },

        handleOfferStatusClick: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const status = $(e.currentTarget).data('status');
            alert(`Managing offers with status '${status}' is coming soon!`);
        },

        toggleGroupPin: function (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            console.log('toggleGroupPin clicked');

            const btn = $(e.currentTarget);
            const id = btn.data('id');
            const model = this.collection.get(id);

            if (model) {
                OfferBuilderState.toggleGroup(model);
            }
        },

        toggleVariantPin: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const btn = $(e.currentTarget);
            const sku = btn.data('sku');

            // Find the variant object. We need to search through the collection models.
            // Since we don't have direct access to the parent model easily from just the button's data-sku in this context without 
            // a lookup, we'll iterate. Optimization: could add data-group-id to the button.
            // For now, let's look through the collection.
            let variant = null;
            let groupModel = null;

            this.collection.each(model => {
                const found = (model.get('variants') || []).find(v => v.sku === sku);
                if (found) {
                    variant = found;
                    groupModel = model;
                    // Add group_id to variant if missing for state tracking
                    variant.group_id = model.id;
                    variant.model = model.get('model'); // Add parent model name
                    variant.manufacturer = model.get('manufacturer');
                    variant.grade = model.get('grade');
                    variant.warehouse = model.get('warehouse');
                    variant.capacity = model.get('capacity'); // Ensure capacity is passed too
                }
            });

            if (variant) {
                OfferBuilderState.togglePin(variant);
            }
        },

        updatePinIcons: function () {
            // Update Variant Icons
            this.$('.btn-pin-variant').each(function () {
                const btn = $(this);
                const sku = btn.data('sku');
                const isPinned = OfferBuilderState.isPinned(sku);
                const icon = btn.find('.material-icons');

                if (isPinned) {
                    icon.text('bookmark');
                    btn.css('color', '#0070B9');
                } else {
                    icon.text('bookmark_border');
                    btn.css('color', '#8BA1A7');
                }
            });

            // Update Group Icons
            const self = this;
            this.$('.btn-pin').each(function () {
                const btn = $(this);
                const id = btn.data('id');
                const model = self.collection.get(id);
                if (!model) return;

                const state = OfferBuilderState.getGroupState(model);
                const icon = btn.find('.material-icons');

                if (state === 'all') {
                    icon.text('bookmark');
                    btn.css('color', '#0070B9');
                } else if (state === 'some') {
                    icon.text('bookmark_add'); // Indeterminate / Add rest
                    btn.css('color', '#0070B9');
                } else {
                    icon.text('bookmark_border');
                    btn.css('color', '#8BA1A7');
                }
            });
        },

        toggleAllDetails: function (e) {
            const btn = $(e.currentTarget);
            // Check text content instead of html to ignore icons
            const isCollapsing = btn.text().includes('Collapse');

            if (isCollapsing) {
                // Collapse All
                this.$('.card-body').slideUp(200);
                this.$('.chevron').removeClass('expanded');
                btn.html('<span class="material-icons" style="font-size: 16px; vertical-align: bottom;">unfold_more</span> Expand All');
            } else {
                // Expand All
                this.$('.card-body').slideDown(200);
                this.$('.chevron').addClass('expanded');
                btn.html('<span class="material-icons" style="font-size: 16px; vertical-align: bottom;">unfold_less</span> Collapse All');
            }
        },

        toggleDetails: function (e) {
            // Prevent collapse if clicking a button or link inside the header
            if ($(e.target).closest('.btn-pin, .btn, a, input').length) {
                return;
            }

            const header = $(e.currentTarget);
            const card = header.closest('.product-card');
            const body = card.find('.card-body');
            const chevron = header.find('.chevron');

            body.slideToggle(200);
            chevron.toggleClass('expanded');
        },

        openBuyModal: function (e) {
            e.preventDefault();
            e.stopPropagation(); // Prevent card collapse
            const id = $(e.currentTarget).data('id');
            const model = this.collection.get(id);
            // Optional: If we want to pre-select the specific variant color/sku in the modal, we'd need to pass that info.
            // For now, let's just open the generic item modal as before. 
            // Better: update modal to set specific price/sku if passed? 
            // The modal uses 'model.toJSON()'.
            // Let's pass the specific SKU in the modal usage if we can.

            if (model) {
                this.modal.open(model, 'buy');
            }
        },

        openOfferModal: function (e) {
            e.preventDefault();
            e.stopPropagation();
            const id = $(e.currentTarget).data('id');
            const model = this.collection.get(id);
            if (model) {
                this.modal.open(model, 'offer');
            }
        },

        removeOneFilter: function (e) {
            const type = $(e.currentTarget).data('type');
            const value = $(e.currentTarget).data('value');
            this.collection.updateFilter(type, value, false);
        },

        resetAll: function () {
            this.collection.state.filters = {
                category: [],
                warehouse: [],
                manufacturer: [],
                model: [],
                grade: [],
                includeOos: false,
                search: ''
            };
            $('#search-input').val('');
            this.collection.state.start = 0;
            this.collection.fetch();
        }
    });

    const PaginationView = Backbone.View.extend({
        el: '.main-results-area',

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.render);
            $(window).on('resize', _.debounce(this.render.bind(this), 200)); // Re-render on resize for text change
        },

        render: function () {
            const start = this.collection.state.start;
            const len = this.collection.state.length;
            const total = this.collection.totalRecords;
            const page = Math.floor(start / len) + 1;
            const totalPages = Math.ceil(total / len);

            const isMobile = window.innerWidth < 768;
            const pageText = isMobile ? `${page} / ${totalPages}` : `Page ${page} of ${totalPages}`;

            // Modern flexible pagination
            let html = `
                <div class="pagination-input-group">
                    <button class="btn btn-default btn-sm prev-page" ${start === 0 ? 'disabled' : ''} aria-label="Previous Page">
                        <span class="material-icons" style="font-size: 20px; vertical-align: middle;">chevron_left</span>
                    </button>
                    <span class="page-info">${pageText}</span>
                    <button class="btn btn-default btn-sm next-page" ${start + len >= total ? 'disabled' : ''} aria-label="Next Page">
                        <span class="material-icons" style="font-size: 20px; vertical-align: middle;">chevron_right</span>
                    </button>
                </div>
            `;

            $('#top-pagination').html(html);
            // We removed bottom pagination in concept, but if it exists, update it too
            $('#pagination-controls').html(html).addClass('pull-right');

            // Update counts
            $('#total-counts').text(`Showing ${Math.min(start + 1, total)} – ${Math.min(start + len, total)} of ${total} results`);
        },

        events: {
            'click .prev-page': function (e) { e.preventDefault(); this.collection.prevPage(); },
            'click .next-page': function (e) { e.preventDefault(); this.collection.nextPage(); }
        }
    });

    const SidebarView = Backbone.View.extend({
        el: 'body',

        events: {
            'change #filter-oos': 'toggleOos',
            'change .filter-checkbox': 'toggleFilter',
            'keyup #search-input': 'handleSearch',
            'click #search-clear': 'clearSearch',
            'click #filter-toggle-btn': 'toggleDrawer', // Changed to toggle
            'click #close-drawer': 'closeDrawer',
            'click #drawer-backdrop': 'closeDrawer',
            'click .remove-filter': 'removeFilterChip',
            'click .filter-section-header': 'toggleSection'
        },

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.renderFilters);
            this.listenTo(this.collection, 'sync', this.updateBadge); // Update badge on sync

            // Auto-ingest active offers on sync
            this.listenTo(this.collection, 'sync', () => {
                const activeVariants = [];
                this.collection.each(model => {
                    const variants = model.get('variants') || [];
                    variants.forEach(v => {
                        // Enrich variant with parent data needed for OfferBuilderState
                        if (v.offerStatus && v.offerStatus !== 'Draft') {
                            v.group_id = model.id;
                            v.model = model.get('model');
                            v.manufacturer = model.get('manufacturer');
                            v.grade = model.get('grade');
                            v.warehouse = model.get('warehouse');
                            v.capacity = model.get('capacity');
                            activeVariants.push(v);
                        }
                    });
                });
                OfferBuilderState.importActiveOffers(activeVariants);
            });
        },

        toggleDrawer: function () {
            const drawer = $('#filter-drawer');
            if (drawer.hasClass('open')) {
                this.closeDrawer();
            } else {
                this.openDrawer();
            }
        },

        openDrawer: function () {
            $('#filter-drawer').addClass('open');
            $('#drawer-backdrop').addClass('open');
            $('#filter-toggle-btn').addClass('active').attr('aria-expanded', 'true');
            if (window.innerWidth < 992) {
                $('body').css('overflow', 'hidden');
            }
        },

        closeDrawer: function () {
            $('#filter-drawer').removeClass('open');
            $('#drawer-backdrop').removeClass('open');
            $('#filter-toggle-btn').removeClass('active').attr('aria-expanded', 'false');
            $('body').css('overflow', '');
        },

        updateBadge: function () {
            const filters = this.collection.state.filters;
            let count = 0;

            // Count array filters
            ['category', 'warehouse', 'manufacturer', 'model', 'grade'].forEach(type => {
                if (filters[type]) count += filters[type].length;
            });

            // Count boolean filters
            if (filters.includeOos) count++;

            const badge = $('#filter-toggle-btn .filter-count');
            badge.text(count);

            if (count > 0) {
                badge.show();
            } else {
                badge.hide();
            }
        },


        removeFilterChip: function (e) {
            const type = $(e.currentTarget).data('type');
            const value = $(e.currentTarget).data('value');
            // If type is special (search), handle differently? Usually just filters
            if (type && value) {
                this.collection.updateFilter(type, value, false); // Turn off
            }
        },

        renderActiveChips: function () {
            // ... (Existing chip logic, moved here or kept in ActiveFiltersView? 
            // Actually, let's keep ActiveFiltersView separate but ensure it renders into #active-filters-container which is now in drawer)
            // Wait, ActiveFiltersView `el` was `#active-filters-container`.
            // If we move `#active-filters-container` into the drawer, ActiveFiltersView will find it IF it exists in DOM.
        },

        toggleOos: function (e) {
            const isChecked = $(e.currentTarget).is(':checked');
            this.collection.updateFilter('oos', null, isChecked);
        },

        toggleSection: function (e) {
            const header = $(e.currentTarget);
            const section = header.closest('.filter-section');
            section.toggleClass('expanded');
        },

        toggleFilter: function (e) {
            const checkbox = $(e.currentTarget);
            const type = checkbox.data('type'); // 'category' or 'warehouse'
            const value = checkbox.val();
            const isChecked = checkbox.is(':checked');
            this.collection.updateFilter(type, value, isChecked);
        },

        handleSearch: _.debounce(function (e) {
            const term = $(e.currentTarget).val();
            this.toggleClearIcon(term);
            this.collection.updateSearch(term);
        }, 300),

        clearSearch: function () {
            $('#search-input').val('').focus();
            this.toggleClearIcon('');
            this.collection.updateSearch('');
        },

        toggleClearIcon: function (term) {
            if (term && term.length > 0) {
                $('#search-clear').show();
            } else {
                $('#search-clear').hide();
            }
        },

        renderFilters: function () {
            const facets = this.collection.facets;
            if (!facets) return;

            const container = $('#sidebar-filters-container');
            container.empty();

            // Helper to render a group
            const renderGroup = (title, type, items) => {
                if (!items || items.length === 0) return;

                // Check if any item in this group is checked to auto-expand
                const isAnyChecked = items.some(item =>
                    this.collection.state.filters[type] && this.collection.state.filters[type].includes(item.label)
                );

                // Default expand Category and Warehouse, others collapsed unless active
                const shouldExpand = isAnyChecked || ['category', 'warehouse'].includes(type);
                const expandClass = shouldExpand ? 'expanded' : '';

                let html = `
                    <div class="filter-section ${expandClass}">
                        <div class="filter-section-header">
                            <h4>${title}</h4>
                            <span class="material-icons chevron">expand_more</span>
                        </div>
                        <div class="filter-section-body">
                `;

                items.forEach(item => {
                    const isChecked = this.collection.state.filters[type] && this.collection.state.filters[type].includes(item.label) ? 'checked' : '';
                    html += `
                        <div class="checkbox-switch">
                            <label>
                                <input type="checkbox" class="filter-checkbox" data-type="${type}" value="${item.label}" ${isChecked}>
                                <span class="slider round"></span>
                                <span class="label-text">${item.label}</span>
                                <span class="badge filter-badge pull-right">${item.count}</span>
                            </label>
                        </div>
                    `;
                });
                html += `</div></div>`;
                container.append(html);
            };

            // Order of rendering based on UAT
            renderGroup('Category', 'category', facets.category);
            renderGroup('Warehouse', 'warehouse', facets.warehouse);
            renderGroup('Grade', 'grade', facets.grade);
            renderGroup('Manufacturer', 'manufacturer', facets.manufacturer);
            renderGroup('Model', 'model', facets.model);
        }
    });

    // --- Experiment View ---
    const ExperimentView = Backbone.View.extend({
        el: '#experiment-panel',
        events: {
            'change #toggle-density': 'toggleDensity',
            'change #toggle-sticky': 'toggleSticky'
        },

        toggleDensity: function (e) {
            const enabled = $(e.currentTarget).is(':checked');
            if (enabled) {
                $('body').addClass('compact-mode');
            } else {
                $('body').removeClass('compact-mode');
            }
        },

        toggleSticky: function (e) {
            const enabled = $(e.currentTarget).is(':checked');
            if (enabled) {
                $('body').addClass('sticky-sidebar-enabled');
            } else {
                $('body').removeClass('sticky-sidebar-enabled');
            }
        }
    });

    const TransactionModalView = Backbone.View.extend({
        el: '#transaction-modal',

        events: {
            'click #modal-submit-btn': 'submit',
            'click #modal-mode-toggle': 'toggleMode',
            'input #modal-qty': 'updateTotal',
            'input #modal-offer-price': 'updateTotal'
        },

        initialize: function () {
            this.model = null; // Currently selected item
            this.mode = 'buy'; // 'buy' or 'offer'
        },

        open: function (model, initialMode = 'buy') {
            this.model = model;
            this.mode = initialMode;
            this.render();
            this.$el.modal('show');
        },

        render: function () {
            const data = this.model.toJSON();

            // Header
            this.$('#modal-item-title').text(`${data.manufacturer} ${data.model} ${data.grade}`);
            this.$('#modal-item-sku').text(`Item #: ${data.sku}`);

            // Info
            this.$('#modal-avail-qty').text(data.quantity);
            this.$('#modal-list-price').text(`$${data.price.toFixed(2)}`);

            // Inputs
            this.$('#modal-qty').val(1).attr('max', data.quantity);
            this.$('#modal-offer-price').val(data.price.toFixed(2));

            this.updateUIState();
            this.updateTotal();
        },

        updateUIState: function () {
            if (this.mode === 'buy') {
                this.$('#modal-offer-price-group').hide();
                this.$('#offer-disclaimer').hide();
                this.$('#modal-mode-toggle').text('Make an Offer');
                this.$('#modal-submit-btn').text('ADD TO CART');
            } else {
                this.$('#modal-offer-price-group').show();
                this.$('#offer-disclaimer').show();
                this.$('#modal-mode-toggle').text('Buy Now'); // Switch back
                this.$('#modal-submit-btn').text('ADD TO CART');
            }
        },

        toggleMode: function (e) {
            e.preventDefault();
            this.mode = (this.mode === 'buy') ? 'offer' : 'buy';
            this.updateUIState();
            this.updateTotal();
        },

        updateTotal: function () {
            const qty = parseInt(this.$('#modal-qty').val()) || 0;
            let price = this.model.get('price');

            if (this.mode === 'offer') {
                price = parseFloat(this.$('#modal-offer-price').val()) || 0;
            }

            const total = qty * price;
            this.$('#modal-total').text(`$${total.toFixed(2)}`);
        },

        submit: function () {
            const qty = this.$('#modal-qty').val();
            const action = this.mode === 'buy' ? 'Purchased' : 'Offered';
            const price = this.mode === 'offer' ? this.$('#modal-offer-price').val() : this.model.get('price');

            alert(`Mock Action: ${action} ${qty} unit(s) of ${this.model.get('model')} at $${price}. Added to cart.`);
            this.$el.modal('hide');
        }
    });

    // Initialize Stock Collection
    const stockCollection = new StockCollection();
    window.stockCollection = stockCollection; // Expose for OfferDrawerView

    // Shared modal instance
    const transactionModal = new TransactionModalView();

    // Pass modal to StockListView so it can trigger it
    new StockListView({
        collection: stockCollection,
        modal: transactionModal
    });

    new PaginationView({ collection: stockCollection });
    new SidebarView({ collection: stockCollection });
    new ActiveFiltersView({ collection: stockCollection });
    new ExperimentView();
    new OfferBarView();
    new OfferDrawerView();

    // Global Controls View (since buttons are outside stock-list-container)
    const GlobalControlsView = Backbone.View.extend({
        el: '.results-controls',
        events: {
            'click #toggle-all-details': 'toggleAllDetails'
        },
        toggleAllDetails: function (e) {
            const btn = $(e.currentTarget);
            const isCollapsing = btn.text().includes('Collapse');

            if (isCollapsing) {
                $('.card-body').slideUp(200);
                $('.chevron').removeClass('expanded');
                btn.html('<span class="material-icons" style="font-size: 16px; vertical-align: bottom;">unfold_more</span> Expand All');
            } else {
                $('.card-body').slideDown(200);
                $('.chevron').addClass('expanded');
                btn.html('<span class="material-icons" style="font-size: 16px; vertical-align: bottom;">unfold_less</span> Collapse All');
            }
        }
    });
    new GlobalControlsView();

    OfferBuilderState.init();

    // Initial Fetch
    stockCollection.fetch();

});
