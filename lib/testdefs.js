// Auto-generated from TechAssures Lab Test Master Specification workbook.
// Each entry: NABL test parameter schema (observation fields). 'paramset' kind tests
// render these dynamically in the testing workspace instead of one generic value field.
// Formulas are recorded as source notes only — not executed — per the workbook's own
// 'Formula rule': must be reviewed/approved by the lab before becoming app logic.
const TEST_DEFS = [
 {
  id: 't_sgwt_fa', doc: "TA/SGWT/FA/OS/001", name: "Specific Gravity & Water Absorption of Fine Aggregates",
  fields: [
   { key: 'weight_of_pycnometer_bottles_aggregate_w', label: "Weight of Pycnometer Bottles + Aggregate + water", unit: "gm", type: "number", repeatable: false, note: "B(gm)" },
   { key: 'weight_of_pycnometer_bottles_water', label: "Weight of Pycnometer Bottles + water", unit: "gm", type: "number", repeatable: false, note: "C(gm)" },
   { key: 'weight_of_saturated_aggregate_in_water_b', label: "Weight of saturated aggregate in water (B-C)", unit: "gm", type: "calculated", repeatable: false, note: "B-C" },
   { key: 'weight_of_aggregate_in_ssd_condition', label: "Weight of aggregate in SSD condition", unit: "gm", type: "number", repeatable: false, note: "A(gm)" },
   { key: 'weight_of_oven_dry_sample_in_air_after_2', label: "Weight of oven dry sample in air after 24 hours \u00b12 hours", unit: "gm", type: "number", repeatable: false, note: "D(gm)" },
   { key: 'specific_gravity', label: "Specific Gravity", unit: null, type: "calculated", repeatable: false, note: "Formula cells/labels indicate D and A-C; confirm exact equation from approved method." },
   { key: 'water_absorption', label: "Water Absorption", unit: "%", type: "calculated", repeatable: false, note: "Formula must be confirmed from sheet/formula cells." },
  ]
 },
 {
  id: 't_sieve_fa', doc: "TA/SA/FA/OS/001", name: "Sieve Analysis of Fine Aggregates",
  fields: [
   { key: 'is_sieve_no', label: "IS Sieve No.", unit: "source-defined", type: "text", repeatable: true, note: "Rows: 10 mm, 4.75 mm, 2.36 mm, 1.18 mm, 600 micron, 300 micron, 150 micron, 75 micron, Pan" },
   { key: 'weight_retained_on_each_sieve', label: "Weight retained on each sieve", unit: "g", type: "number", repeatable: true, note: "Per sieve" },
   { key: 'cumulative_weight_retained', label: "Cumulative weight retained", unit: "g", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'cumulative_weight_retained_a', label: "Cumulative weight retained % (A)", unit: "%", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'passing', label: "% Passing", unit: "%", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'remarks', label: "Remarks", unit: null, type: "text", repeatable: true, note: "Includes zone/remarks field" },
  ]
 },
 {
  id: 't_mfm_fa', doc: "TA/MFM/FA/OS/001", name: "Materials Finer than 75 Micron  of Fine Aggregates",
  fields: [
   { key: 'dry_weight_of_test_sample_x', label: "Dry weight of test sample (X)", unit: "g", type: "number", repeatable: false, note: "X" },
   { key: 'dry_weight_of_washed_sample_y', label: "Dry weight of washed sample (Y)", unit: "g", type: "number", repeatable: false, note: "Y" },
   { key: 'amount_of_material_finer_than_75_micron', label: "Amount of material finer than 75 micron", unit: "g", type: "calculated", repeatable: false, note: "X-Y" },
   { key: 'percentage_of_material_finer_than_75_mic', label: "Percentage of material finer than 75 micron or silt content", unit: "%", type: "calculated", repeatable: false, note: "(X-Y)/X*100 as written in source" },
  ]
 },
 {
  id: 't_dlbd_fa', doc: "TA/DLBD/FA/OS/001", name: "Loose Bulk Density Test  of Fine Aggregates",
  fields: [
   { key: 'weight_of_material', label: "Weight of material", unit: "kg", type: "number", repeatable: false, note: "C. Sand" },
   { key: 'volume_of_cylinder', label: "Volume of cylinder", unit: "L", type: "number", repeatable: false, note: "C. Sand" },
   { key: 'dry_loose_bulk_density_dlbd', label: "Dry loose bulk density (DLBD)", unit: "kg/L", type: "calculated", repeatable: false, note: "Source label: Weight / volume; verify calculation handling" },
  ]
 },
 {
  id: 't_sgwa_ca', doc: "TA/SGWA/CA/OS/001", name: "Specific Gravity & Water Absorption of Coarse Aggregates",
  fields: [
   { key: 'weight_of_basket_aggregate_water', label: "Weight of Basket + Aggregate + water", unit: "gm", type: "number", repeatable: false, note: "B(gm)" },
   { key: 'weight_of_basket_water', label: "Weight of Basket + water", unit: "gm", type: "number", repeatable: false, note: "C(gm)" },
   { key: 'weight_of_aggregate_in_ssd_condition', label: "Weight of aggregate in SSD condition", unit: "gm", type: "number", repeatable: false, note: "A(gm)" },
   { key: 'weight_of_oven_dry_sample_in_air_after_2', label: "Weight of oven dry sample in air after 24 hours \u00b12 hours", unit: "gm", type: "number", repeatable: false, note: "D(gm)" },
   { key: 'specific_gravity', label: "Specific Gravity", unit: null, type: "calculated", repeatable: false, note: "Formula must be confirmed from approved method." },
   { key: 'water_absorption', label: "Water Absorption", unit: "%", type: "calculated", repeatable: false, note: "Formula must be confirmed from approved method." },
  ]
 },
 {
  id: 't_sieve_ca', doc: "TA/SA/CA/OS/001", name: "Sieve Analysis of Coarse Aggregates",
  fields: [
   { key: 'is_sieve_no', label: "IS Sieve No.", unit: "source-defined", type: "text", repeatable: true, note: "Rows: 40 mm, 25 mm, 20 mm, 16 mm, 12.5 mm, 10 mm, 6.3 mm, 4.75 mm, Pan" },
   { key: 'weight_retained_on_each_sieve', label: "Weight retained on each sieve", unit: "g", type: "number", repeatable: true, note: "Per sieve" },
   { key: 'cumulative_weight_retained', label: "Cumulative weight retained", unit: "g", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'cumulative_weight_retained_a', label: "Cumulative weight retained % (A)", unit: "%", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'passing', label: "% Passing", unit: "%", type: "calculated", repeatable: true, note: "Formula implied by label; confirm spreadsheet formulas" },
   { key: 'is_passing_limit', label: "IS Passing % Limit", unit: "source-defined", type: "text", repeatable: true, note: "Source includes limits for selected sieves; preserve as source values and verify current standard" },
   { key: 'remarks', label: "Remarks", unit: null, type: "text", repeatable: true, note: "Per sieve" },
  ]
 },
 {
  id: 't_dlbd_ca', doc: "TA/DLBD/CA/OS/001", name: "Loose Bulk Density Test  of Coarse Aggregates",
  fields: [
   { key: 'weight_of_material', label: "Weight of material", unit: "kg", type: "number", repeatable: false, note: "For 10 mm and 20 mm test columns" },
   { key: 'volume_of_cylinder', label: "Volume of cylinder", unit: "L", type: "number", repeatable: false, note: "For 10 mm and 20 mm test columns" },
   { key: 'dry_loose_bulk_density_dlbd', label: "Dry loose bulk density (DLBD)", unit: "kg/L", type: "calculated", repeatable: false, note: "Source label: Weight / volume; verify calculation handling" },
  ]
 },
 {
  id: 't_impact_ca', doc: "TA/IV/CA/OS/001", name: "Impact Value  of  Coarse Aggregates",
  fields: [
   { key: 'total_weight_of_sample_12_5_10_mm_c', label: "Total weight of sample (12.5\u201310 mm) (C)", unit: "g", type: "number", repeatable: true, note: "T-1 and T-2" },
   { key: 'aggregate_passing_2_36_mm_sieve_a', label: "Aggregate passing 2.36 mm sieve (A)", unit: "g", type: "number", repeatable: true, note: "T-1 and T-2" },
   { key: 'aggregate_retained_on_2_36_mm_sieve_b', label: "Aggregate retained on 2.36 mm sieve (B)", unit: "g", type: "number", repeatable: true, note: "T-1 and T-2" },
   { key: 'total_weight_of_sample_a_b', label: "Total weight of sample (A+B)", unit: "g", type: "calculated", repeatable: true, note: "As named in source" },
   { key: 'aggregate_impact_value', label: "Aggregate impact value", unit: "%", type: "calculated", repeatable: true, note: "Source formula: (A/C)\u00d7100" },
   { key: 'average_aggregate_impact_value', label: "Average aggregate impact value", unit: "%", type: "calculated", repeatable: false, note: "Average of test values; confirm rounding" },
  ]
 },
 {
  id: 't_crush_ca', doc: "TA/CV/CA/OS/001", name: "Crushing Value  of Coarse Aggregates",
  fields: [
   { key: 'total_weight_of_sample_12_5_10_mm_c', label: "Total weight of sample (12.5\u201310 mm) (C)", unit: "g", type: "number", repeatable: true, note: "Two test columns" },
   { key: 'aggregate_passing_2_36_mm_sieve_a', label: "Aggregate passing 2.36 mm sieve (A)", unit: "g", type: "number", repeatable: true, note: "Two test columns" },
   { key: 'aggregate_retained_on_2_36_mm_sieve_b', label: "Aggregate retained on 2.36 mm sieve (B)", unit: "g", type: "number", repeatable: true, note: "Two test columns" },
   { key: 'total_weight_of_sample_a_b', label: "Total weight of sample (A+B)", unit: "g", type: "calculated", repeatable: true, note: "As named in source" },
   { key: 'aggregate_crushing_value', label: "Aggregate crushing value", unit: "%", type: "calculated", repeatable: true, note: "Source formula: (A/C)\u00d7100" },
   { key: 'average_aggregate_crushing_value', label: "Average aggregate crushing value", unit: "%", type: "calculated", repeatable: false, note: "Average of test values; confirm rounding" },
  ]
 },
 {
  id: 't_flaky_ca', doc: "TA/FI/CA/OS/001", name: "Flakiness Index  of  Coarse Aggregates",
  fields: [
   { key: 'aggregate_size', label: "Aggregate size", unit: "source-defined", type: "text", repeatable: false, note: "Header field" },
   { key: 'sieve_size', label: "Sieve size", unit: "source-defined", type: "text", repeatable: true, note: "Predefined size bands in source sheet" },
   { key: 'mass_of_retained_fraction_on_sieve_w', label: "Mass of retained fraction on sieve (w)", unit: "g", type: "number", repeatable: true, note: "Per sieve band" },
   { key: 'mass_of_pieces_retained_on_gauge_n', label: "Mass of pieces retained on gauge (n)", unit: "g", type: "number", repeatable: true, note: "Source wording; confirm whether n is mass or count" },
   { key: 'x_n_w', label: "x = n/w", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'y_w_w', label: "y = w/W", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'xy', label: "xy", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'flakiness_index', label: "Flakiness index", unit: "%", type: "calculated", repeatable: false, note: "Result formula not fully defined by header alone; confirm" },
  ]
 },
 {
  id: 't_elong_ca', doc: "TA/EI/CA/OS/001", name: "Elongation Index  of  Coarse Aggregates",
  fields: [
   { key: 'aggregate_size', label: "Aggregate size", unit: "source-defined", type: "text", repeatable: false, note: "Header field" },
   { key: 'sieve_size', label: "Sieve size", unit: "source-defined", type: "text", repeatable: true, note: "Predefined size bands in source sheet" },
   { key: 'mass_of_retained_fraction_on_sieve_w', label: "Mass of retained fraction on sieve (w)", unit: "g", type: "number", repeatable: true, note: "Per sieve band" },
   { key: 'mass_of_pieces_retained_on_gauge_n', label: "Mass of pieces retained on gauge (n)", unit: "g", type: "number", repeatable: true, note: "Source wording; confirm whether n is mass or count" },
   { key: 'x_n_w', label: "x = n/w", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'y_w_w', label: "y = w/W", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'xy', label: "xy", unit: null, type: "calculated", repeatable: true, note: "Source header formula" },
   { key: 'elongation_index', label: "Elongation index", unit: "%", type: "calculated", repeatable: false, note: "Result formula not fully defined by header alone; confirm" },
  ]
 },
 {
  id: 't_brkcs2', doc: "TA/BFB/CS/OS/001", name: "Compressive Strength of Bricks",
  fields: [
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per brick" },
   { key: 'length', label: "Length", unit: "mm", type: "number", repeatable: true, note: "Per brick" },
   { key: 'width', label: "Width", unit: "mm", type: "number", repeatable: true, note: "Per brick" },
   { key: 'area', label: "Area", unit: "mm\u00b2", type: "calculated", repeatable: true, note: "Per brick" },
   { key: 'load', label: "Load", unit: "kN", type: "number", repeatable: true, note: "Per brick" },
   { key: 'compressive_strength', label: "Compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: true, note: "Per brick" },
   { key: 'average_strength', label: "Average strength", unit: "N/mm\u00b2", type: "calculated", repeatable: false, note: "Source header" },
  ]
 },
 {
  id: 't_brkwa', doc: "TA/BFB/WA/OS/001", name: "Water Absorption of Bricks",
  fields: [
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per brick" },
   { key: 'dry_weight_m1', label: "Dry weight M1", unit: "g", type: "number", repeatable: true, note: "Per brick" },
   { key: 'wet_weight_m2', label: "Wet weight M2", unit: "g", type: "number", repeatable: true, note: "Per brick" },
   { key: 'water_absorption', label: "Water absorption", unit: "%", type: "calculated", repeatable: true, note: "Source formula label: (M2-M1)/M1 \u00d7 100; parentheses should be confirmed" },
   { key: 'average_water_absorption', label: "Average water absorption", unit: "%", type: "calculated", repeatable: false, note: "Source header" },
  ]
 },
 {
  id: 't_brkdim', doc: "TA/DB/LWH/OS/001", name: "Dimensions of Bricks",
  fields: [
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Source has A, B, C rows" },
   { key: '20_brick_average_length_lt_1', label: "20-brick average length LT-1", unit: "mm", type: "number", repeatable: true, note: "Source form describes 20 bricks average length" },
   { key: '20_brick_average_width_wt_1', label: "20-brick average width WT-1", unit: "mm", type: "number", repeatable: true, note: "Source form describes 20 bricks average width" },
   { key: 'height_ht_1', label: "Height HT-1", unit: "mm", type: "number", repeatable: true, note: "Header field" },
   { key: 'length_top_bed_face_lt1_lt2', label: "Length top bed face LT1 & LT2", unit: "mm", type: "number", repeatable: true, note: "Source notes identify LT1 & LT2 as length of top bed face" },
   { key: 'width_top_bed_face_wt1_wt2', label: "Width top bed face WT1 & WT2", unit: "mm", type: "number", repeatable: true, note: "Source notes identify WT1 & WT2 as width of top bed face" },
  ]
 },
 {
  id: 't_paver_cs', doc: "TA/PB/CS/OS/001", name: "Compressive Strength of Paving Block",
  fields: [
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per paving block" },
   { key: 'thickness', label: "Thickness", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'plan_area', label: "Plan area", unit: "mm\u00b2", type: "number", repeatable: true, note: "Per block" },
   { key: 'maximum_load', label: "Maximum load", unit: "kN", type: "number", repeatable: true, note: "Per block" },
   { key: 'apparent_compressive_strength', label: "Apparent compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: true, note: "Per block" },
   { key: 'correction_factor', label: "Correction factor", unit: "source-defined", type: "number", repeatable: true, note: "As per IS 15658:2006 Table 5 in source" },
   { key: 'corrected_compressive_strength', label: "Corrected compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: true, note: "Per block" },
   { key: 'average_compressive_strength', label: "Average compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: false, note: "Source header" },
  ]
 },
 {
  id: 't_aac_odd', doc: "TA/AAC/ODD/OS/001", name: "Autoclave Cellular Aerated Concrete Blocks \u2013 Oven Dry Density & moisture Content",
  fields: [
   { key: 'uid', label: "UID", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'sample_code', label: "Sample code", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'sample_details', label: "Sample details", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'date_of_testing', label: "Date of testing", unit: "date", type: "date", repeatable: false, note: "Header field" },
   { key: 'sample_received_date', label: "Sample received date", unit: "date", type: "date", repeatable: false, note: "Header field" },
   { key: 'temperature', label: "Temperature", unit: "\u00b0C", type: "number", repeatable: false, note: "Header field" },
   { key: 'oven_in_time_date', label: "Oven in time/date", unit: "datetime", type: "datetime", repeatable: false, note: "Header field" },
   { key: 'oven_out_time_date', label: "Oven out time/date", unit: "datetime", type: "datetime", repeatable: false, note: "Header field" },
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per block" },
   { key: 'length', label: "Length", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'width', label: "Width", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'height', label: "Height", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'volume', label: "Volume", unit: "m\u00b3", type: "calculated", repeatable: true, note: "Source unit shown as cum; confirm intended unit" },
   { key: 'oven_dry_weight', label: "Oven dry weight", unit: "kg", type: "number", repeatable: true, note: "Per block" },
   { key: 'dry_density', label: "Dry density", unit: null, type: "calculated", repeatable: true, note: "Result title in source; confirm display unit and formula" },
  ]
 },
 {
  id: 't_aac_cs', doc: "TA/AAC/CS/OS/001", name: "Autoclave Aerated Concrete Blocks Compressive Strength",
  fields: [
   { key: 'uid', label: "UID", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'sample_code', label: "Sample code", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'sample_details', label: "Sample details", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'date_of_testing', label: "Date of testing", unit: "date", type: "date", repeatable: false, note: "Header field" },
   { key: 'witnessed_by', label: "Witnessed by", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'ambient_temperature', label: "Ambient temperature", unit: "\u00b0C", type: "number", repeatable: false, note: "Header field" },
   { key: 'oven_date_time_in_out', label: "Oven date/time in/out", unit: "date/time", type: "datetime", repeatable: false, note: "Header fields" },
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per block" },
   { key: 'length', label: "Length", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'width', label: "Width", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'height', label: "Height", unit: "mm", type: "number", repeatable: true, note: "Per block" },
   { key: 'cross_sectional_area', label: "Cross-sectional area", unit: "mm\u00b2", type: "calculated", repeatable: true, note: "Per block" },
   { key: 'dry_weight', label: "Dry weight", unit: "kg", type: "number", repeatable: true, note: "Per block" },
   { key: 'actual_weight_with_moisture', label: "Actual weight with moisture", unit: "kg", type: "number", repeatable: true, note: "Per block" },
   { key: 'moisture_content', label: "Moisture content", unit: "%", type: "calculated", repeatable: true, note: "Per block" },
   { key: 'load', label: "Load", unit: "kN", type: "number", repeatable: true, note: "Per block" },
   { key: 'compressive_strength', label: "Compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: true, note: "Per block" },
   { key: 'average_compressive_strength', label: "Average compressive strength", unit: "N/mm\u00b2", type: "calculated", repeatable: false, note: "Source header" },
  ]
 },
 {
  id: 't_ndt_rh', doc: "TA/NDT/OS/001", name: "Non Destructive Test \u2013Prediction of Compressive Strength of Concrete by Using Rebound Hammer",
  fields: [
   { key: 'test_request_number', label: "Test request number", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'customer_name', label: "Customer name", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'client_name', label: "Client name", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'customer_address', label: "Customer address", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'site_name_and_address', label: "Site name and address", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'date_of_testing', label: "Date of testing", unit: "date", type: "date", repeatable: false, note: "Header field" },
   { key: 'witnessed_by', label: "Witnessed by", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'ambient_temperature', label: "Ambient temperature", unit: "\u00b0C", type: "number", repeatable: false, note: "Header field" },
   { key: 'surface_moisture', label: "Surface moisture", unit: null, type: "text/number", repeatable: false, note: "Header field" },
   { key: 'machine_number_uid', label: "Machine number (UID)", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'description_of_work', label: "Description of work", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'location_of_building', label: "Location of building", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'date_of_casting_d_o_c', label: "Date of casting (D.O.C)", unit: "date", type: "date", repeatable: true, note: "Per location" },
   { key: 'grade_of_concrete', label: "Grade of concrete", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'rebound_hammer_readings_1_5', label: "Rebound hammer readings 1\u20135", unit: null, type: "number", repeatable: true, note: "Five readings per location" },
   { key: 'equipment_angle', label: "Equipment angle \u03b1", unit: "\u00b0", type: "number", repeatable: true, note: "Per location" },
   { key: 'upv_distance', label: "UPV distance", unit: "mm", type: "number", repeatable: true, note: "Per location" },
   { key: 'upv_time', label: "UPV time", unit: "\u00b5s", type: "number", repeatable: true, note: "Per location" },
   { key: 'type_of_probing', label: "Type of probing", unit: null, type: "select", repeatable: true, note: "Source header" },
  ]
 },
 {
  id: 't_ndt_upv', doc: "TA/NDT/OS/001", name: "Non Destructive Test \u2013Ultrasonic Pulse Velocity",
  fields: [
   { key: 'test_request_number', label: "Test request number", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'customer_name', label: "Customer name", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'client_name', label: "Client name", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'customer_address', label: "Customer address", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'site_name_and_address', label: "Site name and address", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'date_of_testing', label: "Date of testing", unit: "date", type: "date", repeatable: false, note: "Header field" },
   { key: 'witnessed_by', label: "Witnessed by", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'ambient_temperature', label: "Ambient temperature", unit: "\u00b0C", type: "number", repeatable: false, note: "Header field" },
   { key: 'surface_moisture', label: "Surface moisture", unit: null, type: "text/number", repeatable: false, note: "Header field" },
   { key: 'machine_number_uid', label: "Machine number (UID)", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'description_of_work', label: "Description of work", unit: null, type: "text", repeatable: false, note: "Header field" },
   { key: 'location_of_building', label: "Location of building", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'id_mark', label: "ID mark", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'date_of_casting_d_o_c', label: "Date of casting (D.O.C)", unit: "date", type: "date", repeatable: true, note: "Per location" },
   { key: 'grade_of_concrete', label: "Grade of concrete", unit: null, type: "text", repeatable: true, note: "Per location" },
   { key: 'rebound_hammer_readings_1_5', label: "Rebound hammer readings 1\u20135", unit: null, type: "number", repeatable: true, note: "Five readings per location" },
   { key: 'equipment_angle', label: "Equipment angle \u03b1", unit: "\u00b0", type: "number", repeatable: true, note: "Per location" },
   { key: 'upv_distance', label: "UPV distance", unit: "mm", type: "number", repeatable: true, note: "Per location" },
   { key: 'upv_time', label: "UPV time", unit: "\u00b5s", type: "number", repeatable: true, note: "Per location" },
   { key: 'type_of_probing', label: "Type of probing", unit: null, type: "select", repeatable: true, note: "Source header" },
  ]
 },
];
module.exports = { TEST_DEFS };