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

    const StockListView = Backbone.View.extend({
        el: '#stock-list-container',
        template: _.template($('#product-card-template').html()),

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.render);
            this.listenTo(this.collection, 'request', this.showLoading);
        },

        showLoading: function () {
            this.$el.html('<div class="text-center" style="padding: 50px;"><div class="loader">Loading...</div></div>');
        },

        render: function () {
            this.$el.empty();
            if (this.collection.length === 0) {
                this.$el.html('<div class="alert alert-info">No products found holding these criteria.</div>');
                return;
            }

            this.collection.each(model => {
                this.$el.append(this.template(model.toJSON()));
            });

            // Re-bind events for expanded content if needed
            return this;
        },

        events: {
            'click .expand-icon': 'toggleDetails',
            'click .btn-buy': 'buyItem'
        },

        toggleDetails: function (e) {
            const id = $(e.currentTarget).data('id');
            // Assuming the details view is inside the card but hidden
            // In the template, I didn't verify if details-view is inside the .group-container or sibling.
            // Let's assume it's a sibling in the fieldset.
            const card = $(e.currentTarget).closest('fieldset');
            card.find('.details-view').slideToggle();
        },

        buyItem: function (e) {
            const sku = $(e.currentTarget).data('sku');
            alert(`Added SKU ${sku} to cart! (Mock Action)`);
        }
    });

    const PaginationView = Backbone.View.extend({
        el: '#pagination-controls',

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.render);
        },

        render: function () {
            const start = this.collection.state.start;
            const len = this.collection.state.length;
            const total = this.collection.totalRecords;
            const page = Math.floor(start / len) + 1;
            const totalPages = Math.ceil(total / len);

            let html = '';

            // Prev
            html += `<li class="${start === 0 ? 'disabled' : ''}"><a href="#" class="prev-page" aria-label="Previous"><span aria-hidden="true">&laquo;</span></a></li>`;

            // Simple Page Indicator
            html += `<li><span>Page ${page} of ${totalPages}</span></li>`;

            // Next
            html += `<li class="${start + len >= total ? 'disabled' : ''}"><a href="#" class="next-page" aria-label="Next"><span aria-hidden="true">&raquo;</span></a></li>`;

            this.$el.html(html);

            // Update header counts too
            $('#total-counts').text(`Showing ${start + 1} to ${Math.min(start + len, total)} of ${total} entries`);
        },

        events: {
            'click .prev-page': function (e) { e.preventDefault(); this.collection.prevPage(); },
            'click .next-page': function (e) { e.preventDefault(); this.collection.nextPage(); }
        }
    });

    const SidebarView = Backbone.View.extend({
        el: '.sidebar',

        events: {
            'change #filter-oos': 'toggleOos',
            'change .filter-checkbox': 'toggleFilter',
            'keyup #search-input': 'handleSearch',
            'click #search-clear': 'clearSearch'
        },

        initialize: function () {
            this.listenTo(this.collection, 'sync', this.renderFilters);
        },

        toggleOos: function (e) {
            const isChecked = $(e.currentTarget).is(':checked');
            this.collection.updateFilter('oos', null, isChecked);
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

                let html = `<div class="filter-section"><h4>${title}</h4>`;
                items.forEach(item => {
                    const isChecked = this.collection.state.filters[type] && this.collection.state.filters[type].includes(item.label) ? 'checked' : '';
                    html += `
                        <div class="checkbox">
                            <label>
                                <input type="checkbox" class="filter-checkbox" data-type="${type}" value="${item.label}" ${isChecked}> 
                                ${item.label} <span class="text-muted">(${item.count})</span>
                            </label>
                        </div>
                    `;
                });
                html += `</div>`;
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
            'change #toggle-search': 'toggleSearch',
            'change #toggle-density': 'toggleDensity',
            'change #toggle-sticky': 'toggleSticky'
        },

        toggleSearch: function (e) {
            const enabled = $(e.currentTarget).is(':checked');
            if (enabled) {
                $('#search-container').slideDown();
                $('#search-input').focus();
            } else {
                $('#search-container').slideUp();
                // Clear search if disabled? Maybe not for now.
            }
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

    // --- Init ---
    const stockCollection = new StockCollection();

    new StockListView({ collection: stockCollection });
    new PaginationView({ collection: stockCollection });
    new SidebarView({ collection: stockCollection });
    new ExperimentView();

    // Initial Fetch
    stockCollection.fetch();

});
