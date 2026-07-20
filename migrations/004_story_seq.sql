ALTER TABLE stories ADD COLUMN seq INTEGER;
CREATE UNIQUE INDEX idx_stories_seq ON stories(seq) WHERE seq IS NOT NULL;
