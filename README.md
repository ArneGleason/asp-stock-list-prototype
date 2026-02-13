# Stock List Prototype

This is a faithful high-fidelity prototype of the Stock List page, built using the same legacy stack found in UAT (Backbone.js + jQuery + Bootstrap 3).

## 🚀 How to Run

Since this prototype fetchs modules from CDNs and uses simulated AJAX calls, it requires a local web server to run correctly (to avoid Cross-Origin issues with `file://` protocol).

### Option 1: Python (Mac/Linux)
Open a terminal in this folder and run:
```bash
python3 -m http.server 8888
```
Then open [http://localhost:8888](http://localhost:8888) in your browser.

### Option 2: VS Code Live Server
If you use VS Code, right-click `index.html` and choose "Open with Live Server".

## 📂 Project Structure

- `index.html`: Main entry point. Contains the HTML structure, Experiment Panel, and Underscore.js templates.
- `css/styles.css`: Custom styling overrides to match the Hyla UAT theme.
- `js/mock-data.js`: 
  - Generates ~500 mock stock items.
  - Simulates the API endpoint (`MockApi.getGroups`) including filtering, sorting, and pagination logic.
- `js/app.js`: 
  - **Backbone Models/Collections**: Manages state and data fetching.
  - **Backbone Views**: Handles rendering and user interaction.
  - **Experiment Logic**: Handles the UX improvement toggles.

## 🛠 How to Tweak

### Modifying Data
Edit `js/mock-data.js` to change the `WAREHOUSES`, `CATEGORIES`, or the generation logic. You can increase the loop count to test performance with thousands of items.

### Changing API Logic
The `MockApi.getGroups` function in `js/mock-data.js` is where the filtering happens. You can add new filter params here.

### Comparing with UAT
See `../bite_6_fidelity_checklist.md` for a comparison of features.

## 🧪 Experiments (UX Improvements)
Use the panel at the bottom left to toggle:
1.  **Instant Search**: Adds a real-time search bar to the sidebar.
2.  **Compact Mode**: Reduces padding for higher data density.
3.  **Sticky Sidebar**: Keeps filters in view while scrolling.

## 🔗 Feature: Dependent Sidebar Filters (New)

The prototype now supports "tiered" filtering logic to match UAT behavior:
- Selection of **Category: Phones** reveals the **Manufacturer** filter.
- Selection of a **Manufacturer** (e.g., Apple) reveals the **Model** filter.
- Unchecking a parent filter automatically hides and clears the dependent child filters.

## 🎨 UI Refactor (New)

The Stock List UI has been modernized with:
1.  **Responsive Filter Drawer**: 
    -   **Desktop**: Pushes content to the right.
    -   **Mobile**: Full-screen overlay with backdrop.
2.  **Persistent Search**: Always visible at the top.
3.  **Active Chips**: Selected filters appear as chips below the search bar.
4.  **Accordion Sections**: Filter categories are collapsible.
