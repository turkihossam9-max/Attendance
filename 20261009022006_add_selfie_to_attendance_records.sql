/*
# Add selfie evidence to attendance records

1. Modified Tables
- `attendance_records`
- Added `selfie_data` (text, nullable): a captured front-camera selfie encoded by the app and attached to the attendance event.

2. Security
- No new table or policy is introduced. Existing attendance-record access rules remain in effect.

3. Important Notes
- The value is nullable so existing attendance records remain valid.
- New attendance records created by the app include a required selfie before the attendance action is submitted.
- This stores evidence of the selfie capture; automatic face matching requires a dedicated face-verification service and is not claimed by this change.
*/

ALTER TABLE attendance_records
ADD COLUMN IF NOT EXISTS selfie_data text;