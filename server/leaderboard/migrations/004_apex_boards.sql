-- Apex Overdrive: two-lap race times, lower is better.
-- Board IDs and rules versions are immutable once submissions exist.
INSERT INTO game_lb_boards
(namespace,id,rules_version,direction,min_score,max_score,min_duration_ms,max_duration_ms,`open`)
VALUES
('production','harbor-race-v1','v1','asc',45000,900000,45000,900000,TRUE),
('production','canyon-race-v1','v1','asc',45000,900000,45000,900000,TRUE),
('production','vault-race-v1','v1','asc',45000,900000,45000,900000,TRUE)
ON DUPLICATE KEY UPDATE
  rules_version = VALUES(rules_version),
  direction = VALUES(direction),
  min_score = VALUES(min_score),
  max_score = VALUES(max_score),
  min_duration_ms = VALUES(min_duration_ms),
  max_duration_ms = VALUES(max_duration_ms),
  `open` = VALUES(`open`);
