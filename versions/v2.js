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
            }
            this.triggerUpdate();
        },

        // Toggle a specific variant
        togglePin: function (variant) {
            const sku = variant.sku;
            if (this.pinnedItems[sku]) {
                delete this.pinnedItems[sku];
            } else {
                this.pinnedItems[sku] = {
                    sku: variant.sku,
                    group_id: variant.group_id,
                    model: variant.model,
                    manufacturer: variant.manufacturer,
                    description: variant.description || ((variant.color || '') + ' ' + (variant.network || '')).trim(),
                    grade: variant.grade,
                    warehouse: variant.warehouse,
                    qty: 0,
                    price: 0,
                    availableQty: variant.quantity,
                    listPrice: variant.price
                };
            }
            this.save();
            this.triggerUpdate();
        },

        // Toggle all variants in a group
        toggleGroup: function (groupModel) {
            const variants = groupModel.get('variants') || [];
            const groupId = groupModel.id;

            // Check if all are currently pinned
            const allPinned = variants.every(v => this.pinnedItems[v.sku]);

            if (allPinned) {
                // Unpin all
                variants.forEach(v => {
                    delete this.pinnedItems[v.sku];
                });
            } else {
                // Pin all (that aren't already pinned)
                variants.forEach(v => {
                    if (!this.pinnedItems[v.sku]) {
                        this.pinnedItems[v.sku] = {
                            sku: v.sku,
                            group_id: groupId,
                            model: groupModel.get('model'),
                            manufacturer: groupModel.get('manufacturer'),
                            description: ((v.color || '') + ' ' + (v.network || '')).trim(),
                            grade: v.grade || groupModel.get('grade'),
                            warehouse: v.warehouse || groupModel.get('warehouse'),
                            qty: 0,
                            price: 0,
                            availableQty: v.quantity,
                            listPrice: v.price
                        };
                    }
                });
            }
            this.save();
            this.triggerUpdate();
        },

        isPinned: function (sku) {
            return !!this.pinnedItems[sku];
        },

        // Returns: 'all', 'some', 'none'
        getGroupState: function (groupModel) {
            const variants = groupModel.get('variants') || [];
            if (variants.length === 0) return 'none'; // Should not happen

            const pinnedCount = variants.filter(v => this.pinnedItems[v.sku]).length;

            if (pinnedCount === variants.length) return 'all';
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
        }
    };

    // --- Offer Bar View (Sticky Footer) ---
    const OfferBarView = Backbone.View.extend({
        el: '#offer-bar',

        events: {
            'click .offer-clear-btn': 'clearAll',
            'click .btn-review-offer': 'reviewOffer'
        },

        initialize: function () {
            this.listenTo(Backbone, 'offerBuilder:update', this.render);
            // Initial render
            this.render();
        },

        render: function () {
            const pinnedCount = Object.keys(OfferBuilderState.pinnedItems).length;
            const $countBadge = this.$('.offer-count-badge');

            if (pinnedCount > 0) {
                this.$el.addClass('visible');
                $countBadge.text(pinnedCount + (pinnedCount === 1 ? ' Item' : ' Items'));
            } else {
                this.$el.removeClass('visible');
            }
        },

        clearAll: function (e) {
            e.preventDefault();
            OfferBuilderState.clearAll();
        },

        reviewOffer: function (e) {
            e.preventDefault();
            $('.offer-drawer').addClass('open');
        }
    });

    // --- Offer Drawer View ---
    const OfferDrawerView = Backbone.View.extend({
        el: '#offer-drawer',
        groupTemplate: _.template($('#offer-group-template').html()),
        variantTemplate: _.template($('#offer-variant-template').html()),

        events: {
            'click .drawer-close-btn': 'closeDrawer',
            'click .offer-item-remove': 'removeItem',
            'change .control-input': 'updateItemState',
            'keyup .control-input': 'updateItemState',
            'click .btn-generate-xlsx': 'generateXLSX',
            'click #drawer-menu-btn': 'toggleMenu',
            'click .btn-place-offer': 'placeOffers',
            'click .btn-group-action.remove': 'removeGroup',
            'click .btn-group-action.add-all': 'addAllInGroup',
            'click .variant-menu-btn': 'toggleVariantMenu',
            'click .action-view-cart': 'viewInCart',
            'click .action-cancel-offer': 'cancelOffer'
        },

        initialize: function () {
            this.listenTo(Backbone, 'offerBuilder:update', this.render);
            $(document).on('click', (e) => {
                const $target = $(e.target);

                // Close overflow menus if clicked outside
                if (!$target.closest('.overflow-menu-container').length) {
                    this.$('#drawer-overflow-menu').removeClass('open');
                }
                if (!$target.closest('.variant-menu-container').length) {
                    this.$('.variant-overflow-menu').removeClass('open');
                }

                // Close drawer if clicked outside drawer AND outside the toggle bar
                if (!$target.closest('#offer-drawer').length && !$target.closest('#offer-bar').length) {
                    if (this.$el.hasClass('open')) {
                        this.closeDrawer();
                    }
                }
            });
        },

        render: function () {
            const listContainer = this.$('.offer-item-list');
            listContainer.empty();

            const items = Object.values(OfferBuilderState.pinnedItems);

            if (items.length === 0) {
                listContainer.html('<div class="text-center text-muted" style="padding: 20px;">No items selected.</div>');
                this.$('.offer-total-amount').text('$0.00');
                this.$('.btn-place-offer').prop('disabled', true);
                return;
            }

            const groups = _.groupBy(items, (item) => item.model || 'Other');
            let totalValue = 0;
            let hasValidOffer = false;

            Object.keys(groups).forEach(groupName => {
                const groupItems = groups[groupName];
                const firstItem = groupItems[0];

                // Aggregate unique attributes for badges
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

                console.log(`Rendering group ${groupName}: Grades=[${Array.from(uniqueGrades)}], Warehouses=[${Array.from(uniqueWarehouses)}]`);

                const $groupEl = $(this.groupTemplate({
                    groupId: firstItem.group_id || 'misc',
                    manufacturer: firstItem.manufacturer || '',
                    model: groupName,
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

                    // Mock Status logic
                    if (!item.status) {
                        // 80% Draft, 20% Random other status for demo
                        item.status = (Math.random() < 0.2)
                            ? ['Offer Placed', 'Offer Accepted', 'Offer Rejected'][Math.floor(Math.random() * 3)]
                            : 'Draft';
                    }

                    const $variantEl = $(this.variantTemplate({
                        sku: item.sku,
                        model: item.model,
                        grade: item.grade || '',
                        description: item.description || item.grade,
                        qty: item.qty,
                        availableQty: item.availableQty || 999, // Match stored property
                        price: offerPrice,
                        listPrice: item.listPrice || 0, // Match stored property
                        status: item.status,
                        totalPromise: (item.qty * (item.price || 0)) // We can just do logic in template or calc here. 
                        // Actually template doesn't have total param, so we need to add it or let JS init it.
                        // Let's add it via logic after append or just rely on render.
                        // Simplest: pass it to template? No, template needs modification. 
                        // Wait, I updated HTML to include span. I need to populate it.
                        // I'll populate it right after creating element.
                    }));

                    const initialTotal = item.qty * (item.price || 0);
                    $variantEl.find('.item-total').html(this.formatMoneyHTML(initialTotal));

                    $variantsContainer.append($variantEl);

                    if (item.price) {
                        totalValue += (item.qty * item.price);
                    }
                });

                listContainer.append($groupEl);
            });

            // Update total value based on ALL items
            this.updateTotalValue(items);
            this.$('.btn-place-offer').prop('disabled', !hasValidOffer && items.length > 0);
        },

        closeDrawer: function () {
            this.$el.removeClass('open');
            this.$('#drawer-overflow-menu').removeClass('open');
        },

        toggleMenu: function (e) {
            e.stopPropagation();
            this.$('#drawer-overflow-menu').toggleClass('open');
        },

        removeGroup: function (e) {
            e.stopPropagation(); // Prevent bubbling
            const groupName = $(e.currentTarget).closest('.offer-group').data('group-name');
            console.log('Removing group:', groupName);

            if (!groupName) return;

            // Find all items with this model in state and remove them
            const items = Object.values(OfferBuilderState.pinnedItems);
            let removedCount = 0;

            items.forEach(item => {
                // Loose comparison or exact match depending on data
                if (item.model === groupName || (groupName === 'Other' && !item.model)) {
                    delete OfferBuilderState.pinnedItems[item.sku];
                    removedCount++;
                }
            });

            console.log(`Removed ${removedCount} items from group ${groupName}`);
            OfferBuilderState.save();
        },

        addAllInGroup: function (e) {
            e.stopPropagation();
            const groupName = $(e.currentTarget).closest('.offer-group').data('group-name');
            console.log('Adding all for group:', groupName);

            if (window.stockCollection) {
                // Filter models that match the group name
                const matchingModels = window.stockCollection.filter(model => model.get('model') === groupName);

                let addedCount = 0;
                matchingModels.forEach(model => {
                    const attrs = model.toJSON();
                    // Add if not already pinned
                    if (!OfferBuilderState.pinnedItems[attrs.sku]) {
                        // Ensure required fields are present
                        if (!attrs.manufacturer) attrs.manufacturer = attrs.brand || ''; // fallback

                        OfferBuilderState.pinnedItems[attrs.sku] = attrs;
                        addedCount++;
                    }
                });
                console.log(`Added ${addedCount} items to group ${groupName}`);
                OfferBuilderState.save();
            } else {
                console.error('StockCollection not found');
                alert('Cannot access stock data to add items.');
            }
        },

        removeItem: function (e) {
            const sku = $(e.currentTarget).closest('.offer-variant-row').data('sku');
            if (sku) {
                OfferBuilderState.togglePin({ sku: sku });
            }
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
                OfferBuilderState.pinnedItems[sku].qty = qty;

                if (!isNaN(price) && price >= 0) {
                    OfferBuilderState.pinnedItems[sku].price = price;
                } else if (priceVal === '') {
                    OfferBuilderState.pinnedItems[sku].price = null;
                }

                OfferBuilderState.save();
                OfferBuilderState.save();
                OfferBuilderState.triggerUpdate(); // Essential for total recalculation
            }

            // Update local item total display
            if (!isNaN(price) && price >= 0) {
                const total = qty * price;
                row.find('.item-total').html(this.formatMoneyHTML(total));
            } else {
                row.find('.item-total').html(this.formatMoneyHTML(0));
            }
        },

        updateTotalDisplay: function () {
            // Deprecated by full re-render on save() to update line totals, 
            // but kept if we switch to lighter update
            this.render();
        },

        placeOffers: function () {
            const count = Object.keys(OfferBuilderState.pinnedItems).length;
            alert(`Successfully placed offers for ${count} items!`);
            this.closeDrawer();
        },

        onSearchInput: function () {
            this.render();
            // Focus is maintained by browser usually, but strict re-render might lose it if input is inside?
            // Wait, input is NOT inside .offer-item-list, it serves as header. So focus is safe.
        },

        updateTotalValue: function (items) {
            let total = 0;
            items.forEach(item => {
                const price = parseFloat(item.price || 0);
                const qty = parseInt(item.qty || 0);
                if (!isNaN(price) && !isNaN(qty)) {
                    total += price * qty;
                }
            });
            this.$('.offer-total-amount').text('$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        },

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

        updateTotalValue: function (items) {
            let total = 0;
            items.forEach(item => {
                const price = parseFloat(item.price || 0);
                const qty = parseInt(item.qty || 0);
                if (!isNaN(price) && !isNaN(qty)) {
                    total += price * qty;
                }
            });
            this.$('.offer-total-amount').text('$' + total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
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
                this.$el.append(this.template(model.toJSON()));
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
            'click #toggle-all-details': 'toggleAllDetails'
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
            // Also need to listen if filters change locally before sync? 
            // Sync happens after fetch, so it's accurate.
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
