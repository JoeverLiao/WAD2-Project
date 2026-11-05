# Storage guidance rules

`storageGuidance.js` resolves placement from the item name and category. It is used by receipt enrichment, confirmation, inventory reads and moves. It does not extend recorded expiry dates or alter amounts. New state-specific receipt estimates are conservatively capped, so cooked food does not inherit dry-food estimates. Existing records get current placement advice when read, without a database migration.

## Model and assumptions

- The app has one Fridge and one Pantry. The Fridge contains Shelves, Crisper, Freezer and two door shelves. Old upper/middle/lower shelf IDs are aliases of the same Shelves area.
- Category rules cover dairy, eggs, meat, seafood, prepared food, plant proteins, vegetables, whole root vegetables, fruit, bakery, beverages, condiments, dry goods, snacks, canned goods and frozen products.
- Specific names take precedence for frozen/thawed food, whole versus separated eggs, cooked meals, cut produce, fresh herbs, shelf-stable cartons, opened cans, cream desserts and fresh pasta. State words survive receipt name standardisation.
- An unopened packaged product is assumed only when a name explicitly identifies a shelf-stable format such as canned or UHT. Explicit fresh/chilled/keep-refrigerated descriptions take priority. Dry powders are separate from liquid cartons.
- The app cannot detect opening, ripeness, preparation, contamination or temperature. The name can record relevant state, and packaging instructions take precedence. Unknown foods receive neutral advice instead of an invented restriction.
- Accepting a Freezer location may require preparation and suitable packaging. This is not permission to refreeze thawed food or freeze whole eggs in shells.
- Raw meat can use the app's unified Shelves area, with the explanation to keep it sealed low down and below ready-to-eat foods. The app cannot enforce physical shelf order within that area.

## Source basis

Reviewed 5 November 2026. These sources support placement and handling; placement rules are separate from shelf-life estimates. Existing recorded dates are never recalculated on read; only new suggestions receive the state-specific caps described above.

- [Singapore Food Agency: Food Safety Tips](https://www.sfa.gov.sg/food-safety-tips/safe-food-practices/food-safety-tips): fridge at 4°C or below, freezer at -18°C or below, airflow and minimising temperature fluctuations.
- [FoodSafety.gov: Four Steps to Food Safety](https://www.foodsafety.gov/keep-food-safe/4-steps-to-food-safety): keep eggs in their carton in the refrigerator's main compartment, away from the door; separate raw foods.
- [FoodSafety.gov: Cold Food Storage Chart](https://www.foodsafety.gov/food-safety-charts/cold-food-storage-charts): meat/poultry/seafood chilled or frozen; whole shell eggs and hard-cooked eggs do not freeze well; live shellfish, prepared salads and some desserts need separate treatment.
- [FDA: Safe Food Shopping and Storage](https://www.fda.gov/media/115188/download): eggs outside the door and raw meat below ready-to-eat foods.
- [Food Standards Scotland: Food storage](https://www.foodstandards.gov.scot/consumer-advice/food-safety/food-safety-in-the-kitchen/food-storage): cooked rice refrigerated for no more than 24 hours.
- [UK guidance: chilling, freezing and defrosting](https://www.gov.uk/government/publications/how-to-chill-freeze-and-defrost-food-safely/how-to-chill-freeze-and-defrost-food-safely): follow labels, prepare and package suitable food for freezing, and refrigerate opened canned food in a covered container.
- [Kansas State/Missouri Extension: Storing Fresh Produce](https://www.ccfruitandnuts.ucanr.edu/sites/default/files/2023-07/386565.pdf): whole produce exceptions, ripening, herbs, and refrigeration after cutting or peeling.
- [Hong Kong Centre for Food Safety: UHT milk](https://www.cfs.gov.hk/english/multimedia/multimedia_pub/multimedia_pub_fsf_236_04.html): unopened versus opened storage.
- [NOAA Fisheries: Seafood Storage](https://www.fisheries.noaa.gov/national/sustainable-seafood/how-store-and-handle-seafood): fresh fish freezing and separate handling of live shellfish.
- [National Center for Home Food Preservation: Freezing](https://nchfp.uga.edu/how/freeze/): product-specific preparation for produce, herbs and other foods; freezing does not sterilise food.
- [University Extension: Nut storage](https://ask.extension.org/kb/faq.php?id=414651): refrigerated or frozen storage for nuts kept longer.

The category grouping and name matching are application choices derived from these sources, not a claim that a source lists every supported ingredient or every recipe.
