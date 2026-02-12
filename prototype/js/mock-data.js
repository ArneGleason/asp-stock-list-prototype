/**
 * Mock Data Generator & API Simulator
 * Mimics the server-side logic for the Stock List page.
 */

(function (root) {
    const WAREHOUSES = ['CUST3', 'W23', 'DLS', 'MAIN', 'NYC'];
    const CATEGORIES = ['Phones', 'Tablets', 'Accessories', 'Hearables', 'Wearables', 'Laptops'];
    const GRADES = ['JPN B+', 'DLS R', 'A+', 'C', 'Open Box'];
    const MODELS = {
        'Phones': ['iPhone 11', 'iPhone 12', 'iPhone 13 Pro', 'Galaxy S21', 'Pixel 6'],
        'Tablets': ['iPad Air', 'Galaxy Tab S7', 'Surface Go'],
        'Accessories': ['Case', 'Screen Protector', 'Charger'],
        'Hearables': ['AirPods Pro', 'Galaxy Buds', 'Pixel Buds'],
        'Wearables': ['Apple Watch Series 7', 'Galaxy Watch 4'],
        'Laptops': ['MacBook Air', 'Dell XPS 13']
    };

    // Manufacturer Mappings
    const MANUFACTURERS = {
        'iPhone': 'Apple',
        'iPad': 'Apple',
        'MacBook': 'Apple',
        'AirPods': 'Apple',
        'Apple': 'Apple',
        'Galaxy': 'Samsung',
        'Pixel': 'Google',
        'Surface': 'Microsoft',
        'Dell': 'Dell'
    };

    // Generate ~500 items
    const generateData = () => {
        const data = [];
        for (let i = 0; i < 600; i++) {
            const cat = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
            const models = MODELS[cat];
            const model = models[Math.floor(Math.random() * models.length)];
            const grade = GRADES[Math.floor(Math.random() * GRADES.length)];
            const wh = WAREHOUSES[Math.floor(Math.random() * WAREHOUSES.length)];
            const qty = Math.floor(Math.random() * 50); // Some will be 0
            const price = 100 + Math.floor(Math.random() * 900);

            // Determine Manufacturer
            let mfr = 'Other';
            for (const key in MANUFACTURERS) {
                if (model.includes(key)) {
                    mfr = MANUFACTURERS[key];
                    break;
                }
            }

            // Create group structure
            data.push({
                id: i,
                description: `${model} ${Math.floor(Math.random() * 256)}GB`,
                category: cat,
                manufacturer: mfr, // Added explicit manufacturer
                model: model, // Added explicit model for filtering
                warehouse: wh,
                grade: grade,
                quantity: qty,
                price: price, // Base price
                items: [
                    {
                        itemNumber: `SKU-${10000 + i}`,
                        quantity: qty,
                        price: price,
                        attributes: {
                            manufacturer: mfr,
                            model: model,
                            warehouse: wh
                        }
                    }
                ]
            });
        }
        return data;
    };

    const ALL_DATA = generateData();

    // Mock API Object
    const MockApi = {
        getGroups: function (params) {
            console.log("Mock API Request:", params);

            // 1. Filtering
            let filtered = ALL_DATA.filter(item => {
                // Category Filter
                if (params.category && params.category.length > 0) {
                    if (!params.category.includes(item.category)) return false;
                }

                // Manufacturer Filter
                if (params.manufacturer && params.manufacturer.length > 0) {
                    if (!params.manufacturer.includes(item.manufacturer)) return false;
                }

                // Model Filter (Matches description loosely for this prototype, or we could match exact model string if we had it normalized)
                if (params.model && params.model.length > 0) {
                    // Our description is "Model + Capacity". Let's check if description starts with one of the selected models
                    // Or better, check if the item's model is in the list (we need to pass model correctly)
                    // In generateData, 'model' variable is the clean model name.
                    // But 'item' only has description. Let's fix generateData to include raw model too.
                    // WAIT: I added manufacturer to item in generateData above. I should also add 'modelName' or similar.
                    // Let's assume description contains it.
                    // Actually, let's look at generateData again.
                    // I'll update generateData to include 'model' property in the root object for easier filtering.
                }

                // Warehouse Filter
                if (params.warehouse && params.warehouse.length > 0) {
                    if (!params.warehouse.includes(item.warehouse)) return false;
                }

                // Grade Filter
                if (params.grade && params.grade.length > 0) {
                    if (!params.grade.includes(item.grade)) return false;
                }

                // Out of Stock Filter
                if (params.includeOos !== 'true' && params.includeOos !== true) {
                    if (item.quantity === 0) return false;
                }

                // Search Filter
                if (params.search && params.search.length > 0) {
                    const term = params.search.toLowerCase();
                    if (!item.description.toLowerCase().includes(term)) return false;
                }

                return true;
            });

            // Re-filter for model specifically now that I realized I need to access the raw model name
            // I will inject 'model' into the root object in generateData in this same edit to make this safe.
            if (params.model && params.model.length > 0) {
                filtered = filtered.filter(item => params.model.includes(item.model));
            }


            // 2. Sorting (Default to Description ASC for now as observed)
            filtered.sort((a, b) => a.description.localeCompare(b.description));

            // Helper for counts
            const getCount = (field, value) => {
                // Counts should reflect "what if I selected this?" OR "current view + this option"? 
                // Usually standard faceted search counts show items matching current criteria + this specific facet value.
                // For simplicity in this mock, let's just count in the currently filtered set? 
                // NO, standard behavior:
                // Category counts: filtered by everything EXCEPT category.
                // Manufacturer counts: filtered by Category + other filters, but NOT manufacturer (so you see peers).
                // For this prototype, let's keep it simple: Count items in the *current context* if we are strictly hierarchical.
                // Actually, if I select "Apple", I still want to see "Samsung (5)" to switch.
                // So, counts for a facet should use filters from PARENT levels, but ignore filters at CURRENT level.

                // However, implementing full "multi-select facet counts" in a mock is complex.
                // Let's just return counts of items that match ALL OTHER criteria.
                return ALL_DATA.filter(d =>
                    (d[field] === value) &&
                    (params.includeOos === 'true' || d.quantity > 0) &&
                    // Apply other active filters? 
                    // For Category: Ignore category filter.
                    // For match: 
                    (!params.warehouse || params.warehouse.length === 0 || params.warehouse.includes(d.warehouse)) &&
                    (!params.search || !params.search.length || d.description.toLowerCase().includes(params.search.toLowerCase()))
                    // simplified
                ).length;
            };

            // Better Count Logic (Simplified for Prototype speed):
            // Just filter ALL_DATA by "Global Filters" (Search, OOS) first.
            let baseData = ALL_DATA.filter(d =>
                (params.includeOos === 'true' || d.quantity > 0) &&
                (!params.search || !params.search.length || d.description.toLowerCase().includes(params.search.toLowerCase()))
            );

            // 3. Facet Counts
            const facets = {};

            // Category Facets (Always Visible)
            // Filter by Warehouse? usually yes.
            // Let's just use baseData filtered by Warehouse for Category counts.
            let catData = baseData;
            if (params.warehouse && params.warehouse.length) catData = catData.filter(d => params.warehouse.includes(d.warehouse));

            facets.category = CATEGORIES.map(c => ({
                label: c,
                count: catData.filter(d => d.category === c).length
            }));

            // Warehouse Facets (Always Visible)
            // Filter by Category? usually yes.
            let whData = baseData;
            if (params.category && params.category.length) whData = whData.filter(d => params.category.includes(d.category));

            facets.warehouse = WAREHOUSES.map(w => ({
                label: w,
                count: whData.filter(d => d.warehouse === w).length
            }));

            // Grade Facets (Always Visible)
            // Filter by Category + Warehouse
            let gradeData = whData; // already filtered by cat
            // if (params.warehouse ... ) // whData is base + category. Need base + category + warehouse
            if (params.warehouse && params.warehouse.length) gradeData = gradeData.filter(d => params.warehouse.includes(d.warehouse));

            facets.grade = GRADES.map(g => ({
                label: g,
                count: gradeData.filter(d => d.grade === g).length
            }));

            // Manufacturer Facets (Dependent on Category = Phone)
            // Only show if params.category contains 'Phones' (or we just show it if data exists in the current filtered set?)
            // UAT behavior: Hierarchy. 
            // If Category has 'Phones', show Manufacturers.
            if (params.category && params.category.includes('Phones')) {
                // Data for counts: Filtered by Category(Phones) + Warehouse + Grade. 
                // Ignore current Manufacturer selection so we see peers.
                let mfrData = baseData.filter(d => params.category.includes(d.category)); // Keep only selected cats (which includes Phones)
                if (params.warehouse && params.warehouse.length) mfrData = mfrData.filter(d => params.warehouse.includes(d.warehouse));
                if (params.grade && params.grade.length) mfrData = mfrData.filter(d => params.grade.includes(d.grade));

                // Get unique manufacturers from this dataset
                const uniqueMfrs = [...new Set(mfrData.map(d => d.manufacturer))].sort();

                facets.manufacturer = uniqueMfrs.map(m => ({
                    label: m,
                    count: mfrData.filter(d => d.manufacturer === m).length
                }));
            }

            // Model Facets (Dependent on Manufacturer)
            // Only show if Manufacturer matches
            if (params.manufacturer && params.manufacturer.length > 0) {
                // Data for counts: Filtered by Cat + Wh + Grade + Mfr.
                // Ignore current Model selection.
                let modelData = baseData.filter(d => params.category.includes(d.category));
                if (params.warehouse && params.warehouse.length) modelData = modelData.filter(d => params.warehouse.includes(d.warehouse));
                if (params.grade && params.grade.length) modelData = modelData.filter(d => params.grade.includes(d.grade));
                // Filter by Manufacturer
                modelData = modelData.filter(d => params.manufacturer.includes(d.manufacturer));

                const uniqueModels = [...new Set(modelData.map(d => d.model))].sort();
                facets.model = uniqueModels.map(m => ({
                    label: m,
                    count: modelData.filter(d => d.model === m).length
                }));
            }

            // 4. Pagination
            const start = parseInt(params.start) || 0;
            const length = parseInt(params.length) || 25;
            const pageData = filtered.slice(start, start + length);

            // 5. Response
            return {
                draw: parseInt(params.draw) || 1,
                recordsTotal: ALL_DATA.length,
                recordsFiltered: filtered.length,
                data: pageData,
                filter: facets
            };
        }
    };

    root.MockApi = MockApi;

})(window);
