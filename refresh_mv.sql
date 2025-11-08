-- Refresh the materialized view to populate it with data
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_goal_priority;

-- Verify it exists and has data
SELECT 'mv_goal_priority row count:' as info, COUNT(*) as count FROM mv_goal_priority;
SELECT 'features row count:' as info, COUNT(*) as count FROM features;
SELECT 'events row count:' as info, COUNT(*) as count FROM events;

