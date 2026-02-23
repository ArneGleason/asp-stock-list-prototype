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

    // Generate ~500 items, grouped by Model+Capacity+Grade+Warehouse
    const generateData = () => {
        const groups = {}; // Key: "Model|Capacity|Grade|Warehouse"

        const COLORS = ['Space Gray', 'Silver', 'Gold', 'Midnight Green', 'Blue', 'Red', 'Graphite', 'Sierra Blue'];
        const NETWORKS = ['Unlocked', 'AT&T', 'Verizon', 'T-Mobile', 'Sprint'];

        // Reduced random pools to create more collisions (grouping)
        const SELECTED_MODELS = {
            'Phones': ['iPhone 12', 'iPhone 13', 'Galaxy S21'],
            'Tablets': ['iPad Air', 'Galaxy Tab S7'],
            'Wearables': ['Apple Watch S7']
        };

        for (let i = 0; i < 600; i++) {
            // weighted random to favor phones for better demo data
            const isPhone = Math.random() > 0.3;
            const cat = isPhone ? 'Phones' : CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

            // Use restricted model list if available for better grouping, else random
            const modelList = SELECTED_MODELS[cat] || MODELS[cat] || MODELS['Accessories'];
            const modelName = modelList[Math.floor(Math.random() * modelList.length)];

            const capacity = `${[64, 128, 256][Math.floor(Math.random() * 3)]}GB`;
            const grade = GRADES[Math.floor(Math.random() * 3)]; // Limit to first 3 grades for density
            const wh = WAREHOUSES[Math.floor(Math.random() * 3)]; // Limit warehouses
            const color = COLORS[Math.floor(Math.random() * COLORS.length)];
            const network = cat === 'Phones' || cat === 'Tablets' ? NETWORKS[Math.floor(Math.random() * NETWORKS.length)] : 'N/A';
            const lockStatus = cat === 'Phones' || cat === 'Tablets' ? (Math.random() > 0.5 ? 'LOCKED' : 'UNLOCKED') : null;

            const qty = Math.floor(Math.random() * 50);
            let basePrice = 200 + Math.floor(Math.random() * 800);

            // Determine Manufacturer
            let mfr = 'Other';
            for (const key in MANUFACTURERS) {
                if (modelName.includes(key)) {
                    mfr = MANUFACTURERS[key];
                    break;
                }
            }

            // Grouping Key
            const groupKey = `${mfr}|${modelName}|${capacity}|${grade}|${wh}`;

            if (!groups[groupKey]) {
                groups[groupKey] = {
                    id: `group-${Object.keys(groups).length}`,
                    manufacturer: mfr,
                    model: `${modelName} ${capacity}`, // Display name
                    rawModel: modelName,
                    capacity: capacity,
                    grade: grade,
                    warehouse: wh,
                    category: cat,
                    quantity: 0,
                    minPrice: Infinity,
                    maxPrice: -Infinity,
                    variants: []
                };
            }

            const sku = `SKU-${10000 + i}`;
            const price = basePrice + (Math.floor(Math.random() * 50));

            // Add Variant (Unique by Color + Network)
            // In reality, variants are unique combinations of attributes not in the group key.
            // Here: Color + Network.

            // Check if exact variant exists
            let variant = groups[groupKey].variants.find(v => v.color === color && v.network === network);
            if (variant) {
                variant.quantity += qty;
            } else {
                // Randomize offer status for demo purposes
                let status = null;
                let offerQty = 0;
                let offerPrice = 0;
                const rand = Math.random();

                if (rand < 0.20) { // Increased probability to 20% for testing
                    // Assign a status
                    if (rand < 0.05) status = 'Pending';
                    else if (rand < 0.10) status = 'Countered';
                    else if (rand < 0.15) status = 'Accepted';
                    else status = 'Rejected';

                    // Generate realistic offer values
                    offerQty = Math.floor(Math.random() * qty) + 1; // 1 to Available Qty

                    // Offer price: List Price - ($5 to $25)
                    const discount = 5 + (Math.random() * 20);
                    offerPrice = Math.max(0, price - discount);
                    offerPrice = Math.round(offerPrice * 100) / 100; // Round to 2 decimals

                    // Logic for Countered status
                    if (status === 'Countered') {
                        // Counter Qty: Maybe same, maybe full avail
                        counterQty = (Math.random() > 0.5) ? qty : offerQty;

                        // Counter Price: Between Offer and List
                        const spread = price - offerPrice;
                        const counterBump = spread * (0.3 + Math.random() * 0.4); // 30-70% of the spread
                        counterPrice = offerPrice + counterBump;
                        counterPrice = Math.round(counterPrice * 100) / 100;
                    }
                }

                groups[groupKey].variants.push({
                    sku: sku,
                    color: color,
                    network: network,
                    lockStatus: lockStatus,
                    quantity: qty,
                    price: price,
                    itemNumber: sku,
                    offerStatus: status,
                    offerQty: status ? offerQty : 0,
                    offerPrice: status ? offerPrice : 0,
                    counterQty: (status === 'Countered') ? counterQty : 0,
                    counterPrice: (status === 'Countered') ? counterPrice : 0,
                    attributes: {
                        warehouse: wh,
                        color: color,
                        network: network,
                        grade: grade,
                        lockStatus: lockStatus
                    }
                });
            }

            // Update Group Aggregates
            groups[groupKey].quantity += qty;
            groups[groupKey].minPrice = Math.min(groups[groupKey].minPrice, price);
            groups[groupKey].maxPrice = Math.max(groups[groupKey].maxPrice, price);
        }

        // Process Groups to determine Varying Attributes
        return Object.values(groups).map(g => {
            if (g.minPrice === Infinity) g.minPrice = 0;
            if (g.maxPrice === -Infinity) g.maxPrice = 0;
            g.priceRange = g.minPrice === g.maxPrice ? `$${g.minPrice}` : `$${g.minPrice} - $${g.maxPrice}`;
            g.price = g.minPrice;

            // Compute Varying Attributes
            const attributes = ['color', 'network', 'lockStatus']; // Candidate attributes to check
            const variance = [];

            attributes.forEach(attr => {
                const uniqueValues = new Set(g.variants.map(v => v[attr]).filter(val => val && val !== 'N/A'));
                if (uniqueValues.size > 1) {
                    // Capitalize first letter
                    const label = attr.charAt(0).toUpperCase() + attr.slice(1);
                    const niceLabel = label === 'LockStatus' ? 'Lock Status' : label;
                    variance.push(niceLabel); // e.g. "Color", "Network", "Lock Status"
                }
            });

            g.varyingAttributes = variance.length > 0 ? variance.join(', ') : null; // "Color, Network" or null

            return g;
        });
    };

    const ALL_DATA = generateData();

    // Mock API Object
    const MockApi = {
        getGroups: function (params) {
            console.log("Mock API Request:", params);

            // 1. Filtering
            let filtered = ALL_DATA.filter(item => {
                if (params.category && params.category.length > 0 && !params.category.includes(item.category)) return false;
                if (params.manufacturer && params.manufacturer.length > 0 && !params.manufacturer.includes(item.manufacturer)) return false;
                if (params.model && params.model.length > 0 && !params.model.includes(item.rawModel)) return false;
                if (params.warehouse && params.warehouse.length > 0 && !params.warehouse.includes(item.warehouse)) return false;
                if (params.grade && params.grade.length > 0 && !params.grade.includes(item.grade)) return false;
                if (params.capacity && params.capacity.length > 0 && !params.capacity.includes(item.capacity)) return false;
                if (params.includeOos !== 'true' && params.includeOos !== true && item.quantity === 0) return false;

                // For variant-level attributes (color, network), keep group if ANY variant matches
                if (params.color && params.color.length > 0) {
                    const hasColor = item.variants.some(v => params.color.includes(v.color));
                    if (!hasColor) return false;
                }
                if (params.network && params.network.length > 0) {
                    const hasNetwork = item.variants.some(v => params.network.includes(v.network));
                    if (!hasNetwork) return false;
                }
                if (params.lockStatus && params.lockStatus.length > 0) {
                    const hasLockStatus = item.variants.some(v => params.lockStatus.includes(v.lockStatus));
                    if (!hasLockStatus) return false;
                }

                if (params.search && params.search.length > 0) {
                    const term = params.search.toLowerCase();
                    if (!item.model.toLowerCase().includes(term)) return false;
                }

                return true;
            });

            // 2. Sorting (Default to Model ASC)
            filtered.sort((a, b) => a.model.localeCompare(b.model));

            // 3. Facets (Simplified Reuse)
            // Just returning counts based on the current filtered set implies "narrowing" behavior. 
            // The previous logic was slightly better but complex. Let's stick to the simple "count in filtered set" for now 
            // or perform a quick re-run for counts if needed. 
            // Actually, let's just use the filtered set for counts for speed in prototype.
            // It means if you select "Apple", Samsung count becomes 0. That's "Drill Down". 
            // User asked for "chips", so maybe Drill Down is okay.

            // ... Actually, let's keep the slightly smarter logic from before:
            // "Global" filters (Search, OOS) apply to everything.
            // "Peer" filters apply to everything except the facet's own category.

            let baseData = ALL_DATA.filter(d =>
                (params.includeOos === 'true' || d.quantity > 0) &&
                (!params.search || !params.search.length || d.model.toLowerCase().includes(params.search.toLowerCase()))
            );

            const getCounts = (field, data) => {
                const counts = {};
                data.forEach(d => {
                    counts[d[field]] = (counts[d[field]] || 0) + 1;
                });
                return counts;
            };

            const facets = {};

            // Category Facets (Filter by Warehouse only)
            let catData = baseData;
            if (params.warehouse && params.warehouse.length) catData = catData.filter(d => params.warehouse.includes(d.warehouse));
            const catCounts = getCounts('category', catData);
            facets.category = CATEGORIES.map(c => ({ label: c, count: catCounts[c] || 0 }));

            // Warehouse Facets (Filter by Category)
            let whData = baseData;
            if (params.category && params.category.length) whData = whData.filter(d => params.category.includes(d.category));
            const whCounts = getCounts('warehouse', whData);
            facets.warehouse = WAREHOUSES.map(w => ({ label: w, count: whCounts[w] || 0 }));

            // Grade Facets (Filter by Cat + Wh)
            let gradeData = whData;
            if (params.warehouse && params.warehouse.length) gradeData = gradeData.filter(d => params.warehouse.includes(d.warehouse));
            const gradeCounts = getCounts('grade', gradeData);
            facets.grade = GRADES.map(g => ({ label: g, count: gradeCounts[g] || 0 }));

            // Manufacturer (Filter by Cat + Wh + Grade)
            let mfrData = gradeData;
            if (params.grade && params.grade.length) mfrData = mfrData.filter(d => params.grade.includes(d.grade));
            const mfrCounts = getCounts('manufacturer', mfrData);
            const uniqueMfrs = Object.keys(mfrCounts).sort();
            facets.manufacturer = uniqueMfrs.map(m => ({ label: m, count: mfrCounts[m] }));

            // Model (Filter by Cat + Wh + Grade + Mfr)
            let modelData = mfrData;
            if (params.manufacturer && params.manufacturer.length) modelData = modelData.filter(d => params.manufacturer.includes(d.manufacturer));
            const modelCounts = getCounts('rawModel', modelData); // Count by raw model name
            const uniqueModels = Object.keys(modelCounts).sort();
            facets.model = uniqueModels.map(m => ({ label: m, count: modelCounts[m] }));

            // Capacity (Base)
            const capacityCounts = getCounts('capacity', baseData);
            const uniqueCapacities = Object.keys(capacityCounts).sort((a, b) => parseInt(a) - parseInt(b));
            facets.capacity = uniqueCapacities.map(c => ({ label: c, count: capacityCounts[c] }));

            // Variant-level facets (Color, Network, LockStatus)
            const colorCounts = {};
            const networkCounts = {};
            const lockStatusCounts = {};
            baseData.forEach(d => {
                // To avoid massive duplication, a simple count of groups matching this attribute
                const groupColors = new Set(d.variants.map(v => v.color));
                const groupNetworks = new Set(d.variants.map(v => v.network).filter(n => n && n !== 'N/A'));
                const groupLockStatuses = new Set(d.variants.map(v => v.lockStatus).filter(l => l));

                groupColors.forEach(c => { colorCounts[c] = (colorCounts[c] || 0) + 1; });
                groupNetworks.forEach(n => { networkCounts[n] = (networkCounts[n] || 0) + 1; });
                groupLockStatuses.forEach(l => { lockStatusCounts[l] = (lockStatusCounts[l] || 0) + 1; });
            });

            facets.color = Object.keys(colorCounts).sort().map(c => ({ label: c, count: colorCounts[c] }));
            facets.network = Object.keys(networkCounts).sort().map(n => ({ label: n, count: networkCounts[n] }));
            facets.lockStatus = Object.keys(lockStatusCounts).sort().map(l => ({ label: l, count: lockStatusCounts[l] }));

            // 4. Pagination
            const start = parseInt(params.start) || 0;
            const length = parseInt(params.length) || 25;
            const pageData = filtered.slice(start, start + length);

            return {
                draw: parseInt(params.draw) || 1,
                recordsTotal: ALL_DATA.length,
                recordsFiltered: filtered.length,
                data: pageData,
                filter: facets
            };
        },

        resetDemoData: function () {
            console.log("Mock API Request: Reset Demo Data");

            // 1. Gather all variants and clear their existing statuses
            const allVariants = [];
            ALL_DATA.forEach(group => {
                group.variants.forEach(variant => {
                    variant.offerStatus = null;
                    variant.offerQty = 0;
                    variant.offerPrice = 0;
                    variant.counterQty = 0;
                    variant.counterPrice = 0;

                    // Inject group properties needed by the UI
                    variant.group_id = group.id;
                    variant.model = group.model;
                    variant.manufacturer = group.manufacturer;
                    variant.grade = group.grade;
                    variant.warehouse = group.warehouse;

                    allVariants.push(variant);
                });
            });

            // 2. Shuffle the variants to pick random 125
            for (let i = allVariants.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [allVariants[i], allVariants[j]] = [allVariants[j], allVariants[i]];
            }

            // 3. Take the first 125 and evenly distribute statuses
            const numOffers = Math.min(125, allVariants.length);
            const selectedVariants = allVariants.slice(0, numOffers);
            const statuses = ['Pending', 'Countered', 'Accepted', 'Rejected'];

            selectedVariants.forEach((variant, index) => {
                const status = statuses[index % statuses.length]; // Round-robin to ensure equal distribution
                let offerQty = 0;
                let offerPrice = 0;
                let counterQty = 0;
                let counterPrice = 0;

                // Generate realistic offer values
                offerQty = Math.floor(Math.random() * variant.quantity) + 1; // 1 to Available Qty

                // Offer price: List Price - ($5 to $25)
                const discount = 5 + (Math.random() * 20);
                offerPrice = Math.max(0, variant.price - discount);
                offerPrice = Math.round(offerPrice * 100) / 100; // Round to 2 decimals

                // Logic for Countered status
                if (status === 'Countered') {
                    // Counter Qty: Maybe same, maybe full avail
                    counterQty = (Math.random() > 0.5) ? variant.quantity : offerQty;

                    // Counter Price: Between Offer and List
                    const spread = variant.price - offerPrice;
                    const counterBump = spread * (0.3 + Math.random() * 0.4); // 30-70% of the spread
                    counterPrice = offerPrice + counterBump;
                    counterPrice = Math.round(counterPrice * 100) / 100;
                }

                variant.offerStatus = status;
                variant.offerQty = offerQty;
                variant.offerPrice = offerPrice;
                variant.counterQty = counterQty;
                variant.counterPrice = counterPrice;
            });

            return selectedVariants;
        }
    };

    root.MockApi = MockApi;

})(window);
