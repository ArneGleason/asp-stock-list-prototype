/**
 * Application Logic
 * Backbone.js + jQuery
 */

$(function () {

    // --- Models & Collections ---

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

                console.log('Fetching with params:', params);

                // Simulate network latency
                setTimeout(() => {
                    const response = window.MockApi.getGroups(params);
                    options.success(response);
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

                // Dependencies: Clear child filters if parent unique selection changes
                // If I uncheck "Phones", I should probably clear Manufacturer and Model.
                // But what if I have "tablets" checked too?
                // For this prototype, strict clear on uncheck of parents?
                // Let's keep it simple: If I uncheck all categories that support manufacturer (Phones), clear manufacturer.
                // But wait, the API logic handles hiding the facets. 
                // However, the selected values in `state.filters.manufacturer` will remain.
                // It's cleaner to clear them if they are no longer valid.
                // For now, let's leave them. If the UI hides them, user can't uncheck them, which is a bug.
                // So yes, we should clear them.
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
        },

        showLoading: function () {
            this.$el.html('<div class="text-center" style="padding: 50px;"><div class="loader">Loading...</div></div>');
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
            return this;
        },

        events: {
            'click .card-header-row': 'toggleDetails',
            'click .btn-buy': 'openBuyModal',
            'click .btn-offer': 'openOfferModal',
            'click .remove-single-filter': 'removeOneFilter',
            'click #reset-all-btn': 'resetAll'
        },

        toggleDetails: function (e) {
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
        el: '.main-content', // Delegate events to container to catch both top and bottom controls

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.render);
        },

        render: function () {
            const start = this.collection.state.start;
            const len = this.collection.state.length;
            const total = this.collection.totalRecords;
            const page = Math.floor(start / len) + 1;
            const totalPages = Math.ceil(total / len);

            // Modern flexible pagination
            let html = `
                <div class="pagination-input-group">
                    <button class="btn btn-default btn-sm prev-page" ${start === 0 ? 'disabled' : ''}>
                        <span class="material-icons" style="font-size: 16px; vertical-align: middle;">chevron_left</span>
                    </button>
                    <span class="page-info">Page ${page} of ${totalPages}</span>
                    <button class="btn btn-default btn-sm next-page" ${start + len >= total ? 'disabled' : ''}>
                        <span class="material-icons" style="font-size: 16px; vertical-align: middle;">chevron_right</span>
                    </button>
                </div>
            `;

            // Render to Top and Bottom Containers (using jQuery directly as they might be inside or outside el depending on structure, but here they are inside .main-content)
            $('#top-pagination').html(html);
            $('#pagination-controls').html(html).addClass('pull-right');

            // Update counts
            $('#total-counts').text(`Showing ${Math.min(start + 1, total)} - ${Math.min(start + len, total)} of ${total} results`);
        },

        events: {
            'click .prev-page': function (e) { e.preventDefault(); this.collection.prevPage(); },
            'click .next-page': function (e) { e.preventDefault(); this.collection.nextPage(); }
        }
    });

    const SidebarView = Backbone.View.extend({
        el: 'body', // Delegating to body to handle interactions outside the drawer (toggle btn, backdrop)

        events: {
            'change #filter-oos': 'toggleOos',
            'change .filter-checkbox': 'toggleFilter',
            'keyup #search-input': 'handleSearch',
            'click #search-clear': 'clearSearch',
            'click #filter-toggle-btn': 'openDrawer',
            'click #close-drawer': 'closeDrawer',
            'click #drawer-backdrop': 'closeDrawer',
            'click .remove-filter': 'removeFilterChip', // Listener for chips
            'click .filter-section-header': 'toggleSection'
        },

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.renderFilters);
            this.listenTo(this.collection, 'sync', this.renderActiveChips); // Re-render chips on sync
        },

        openDrawer: function () {
            $('#filter-drawer').addClass('open');
            // Desktop: Push layout handled by CSS width transition
            // Mobile: Overlay handled by CSS transform

            if (window.innerWidth < 992) {
                $('#drawer-backdrop').addClass('open');
                $('body').css('overflow', 'hidden'); // Prevent scrolling body on mobile
            }
        },

        closeDrawer: function () {
            $('#filter-drawer').removeClass('open');
            $('#drawer-backdrop').removeClass('open');
            $('body').css('overflow', ''); // Restore scrolling
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

    // --- Init ---
    const stockCollection = new StockCollection();

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

    // Initial Fetch
    stockCollection.fetch();

});
