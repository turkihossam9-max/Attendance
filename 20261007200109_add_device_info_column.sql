/*
# Add device info tracking column

## Changes
1. Modified `employees` table:
   - Added `device_info` (text, nullable) - stores a description of the last device used to log in
     (e.g., "Mobile - Safari/iOS", "Desktop - Chrome/Windows")
   - The session_token column remains but is no longer used for kick-out enforcement

## Notes
- The app now allows the same account on multiple devices simultaneously
- device_info is updated on each login to show the owner/HR what device the employee last used
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'employees' AND column_name = 'device_info'
  ) THEN
    ALTER TABLE employees ADD COLUMN device_info text;
  END IF;
END $$;