# Rules for Google Contacts Refiner

## Diacritics
- Prefer Slovak name forms (Štefan, not Stefan)
- Keep names without a Slovak/Czech equivalent as-is (Daniel, Michael, David)
- When uncertain, prefer keeping the original form

## Duplicate Merging
- Never merge contacts with different organizations
- Same name + phone number → merge
- Same name + email → merge
- Exceptions: contacts marked as different people in notes

## Enrichment
- Extract IČO, DIČ, IČ DPH from notes
- Company emails (not Gmail/Seznam) → add organization
- Never overwrite existing values, only fill in missing ones

## Phone Numbers
- Format: international (+421 xxx xxx xxx)
- Slovak numbers: +421
- Czech numbers: +420

## Deletion
- NEVER permanently delete contacts — always move to trash
- User wants 30 days to review before permanent removal
- Applies to contacts, duplicates, and all other operations

## Labels / Contact Groups
- User actively uses labels/groups (e.g. SPSE, family)
- NEVER remove contacts from existing groups
- NEVER delete groups
- When editing a contact, preserve all existing group memberships
- Learn labeling patterns: if a label contains contacts from the same school/company/family, suggest adding similar contacts
- Can add contacts to existing categories and create new meaningful groups
- Create new groups only with >= 80% confidence and >= 3 contacts

## Automatic Mode
- Minimum confidence for automatic changes: 90%
- Maximum changes per run: 200
