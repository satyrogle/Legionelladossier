# TRIRIGA import and export

The app keeps the same buildings and assets as TRIRIGA, linked by TRIRIGA ID. Importing a newer export updates those records rather than adding copies. Results go back as files TRIRIGA can take.

| TRIRIGA | In the app |
| --- | --- |
| Building: ID, name, parent property, address | Site. The building ID becomes the site code. |
| Building equipment: ID, name, spec name, barcode, serial, status, location path | Asset. The spec name decides the water-hygiene type and so the HSG274 tasks. Floor and space come from the path. |
| Floor and space | Floor and space on each asset |

Records that are not part of the water system, such as air handling units or fire extinguishers, are skipped during import.

## 1. Get the data out of TRIRIGA

### Report export (any user with report access)

1. In TRIRIGA's report tools (**My Reports** or **Report Manager**, depending on version and permissions), create a query on **Building Equipment**, or open an existing one.
2. Add these columns: **ID**, **Name**, **Spec Name** (or the asset classification), **Barcode**, **Serial Number**, **Status**, and either the location **Path** or separate **Building**, **Floor** and **Space** columns. Add the building **ID** if the report can reach it, because it gives the most reliable site matching.
3. Filter to water services if your classification allows it. You can also export everything and skip the rest during import.
4. Run the report and use **Export** to download it as Excel.

For buildings, do the same on **Building** with ID, Name, Parent Property, Address, City and Postcode.

### OSLC (TRIRIGA administrator)

Where IBM's TRIRIGA API package is installed, an administrator can save the response of these queries and import the JSON file as it is:

```
https://<your-tririga>/oslc/spq/triAPICOutboundAssetQC?oslc.select=*&oslc.paging=true&oslc.pageSize=500
https://<your-tririga>/oslc/spq/triAPICOutboundBuildingQC?oslc.select=*&oslc.paging=true&oslc.pageSize=500
```

### Data Integrator files

Tab-delimited `.txt` files prepared for TRIRIGA's Data Integrator import as they are.

## 2. Import into the app

1. Open **TRIRIGA** in the app and choose the file. Excel (`.xlsx`), older `.xls` exports (HTML or XML), CSV, tab-delimited text and OSLC JSON all work.
2. Under **What the file holds**, check the mode (assets or buildings only), where the file comes from, and the header row. Report exports often have a title above the header, and the app skips it.
3. Check the column matches. The app recognises TRIRIGA field names (`triIdTX`, `triNameTX`, `triSpecNameTX`, `triPathTX`, `triPrimaryLocPathTX` and others) as well as the usual column labels.
4. If your location paths have an extra level, such as `\Locations\Region\Property\Building\…`, choose which segment is the building.
5. Check the water-hygiene type for each classification. Set anything outside the water system to skip.
6. The preview lists what happens to every row: create, update, unchanged, skip, or a problem with the reason. Press **Import**.
7. On each site page, tick the sentinel and little-used outlets if your export does not carry them. The HSG274 tasks follow the ticks.

### How records are matched

- **Sites** match on TRIRIGA building ID, then site code, then building name.
- **Assets** match on TRIRIGA ID, then record ID, then barcode within the site.
- A file without IDs never replaces an ID link made by an earlier import.
- A **Retired** or **Inactive** status keeps the asset but marks it inactive, so no new tasks are created for it.
- Nothing is deleted. An asset missing from a newer export stays in the app. Mark it inactive on the site page if it has gone.
- Every import is logged with the file name, who ran it and the counts, under **Recent imports**.

## 3. Send data back to TRIRIGA

The TRIRIGA page has exports for the whole estate, and each site page has the same exports for one building.

| Export | Use |
| --- | --- |
| Asset register (Excel or CSV) | A readable list with TRIRIGA IDs, water-hygiene type, sentinel and little-used flags, and the HSG274 tasks for each asset. Use it to review with the client or to update TRIRIGA by hand. |
| Asset register for Data Integrator (`.txt`) | Tab-delimited with TRIRIGA field names: `triIdTX`, `triNameTX`, `triSpecNameTX`, `triBarCodeEntryTX`, `triSerialNumTX`, `triPrimaryLocPathTX`, `triDescriptionTX`, `triStatusCL`. Rows with a blank `triIdTX` are assets added in the field that TRIRIGA does not have yet. |
| PPM results (Excel or tab-delimited) | One row per reading: TRIRIGA asset ID, task, period, outcome, temperature, target, time to reach it, probe and engineer. Attach it to the TRIRIGA work task, or load it into a custom business object. |

Before a Data Integrator upload, create the header file for your Building Equipment form in Data Integrator and check the field names against the export. Delete any column your form does not have.

TRIRIGA IDs are only written for records imported from TRIRIGA. Assets imported from a risk assessment register keep their own references in the readable export's "Source ID" column.

## 4. Live sync (next step)

A scheduled read-only pull from TRIRIGA's OSLC API would keep the app in step without files. It needs a TRIRIGA administrator to confirm the API package is installed, open network access from the app's server, and provide a service account. The importer already reads the OSLC format, so the pull is a small addition once that access exists.

## Sample files

`docs/tririga/samples` has fictional exports to try: a building equipment report (Excel, with a title above the header), a building list (CSV), an OSLC JSON response and a risk assessment outlet register (CSV). Regenerate them with `node scripts/make-tririga-samples.mjs` after `pnpm build`.
