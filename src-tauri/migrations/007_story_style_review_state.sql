-- Add style_review_state column to stories for persistent style review tracking
-- Stores JSON with messagesSinceLastReview (number) and lastReview (StyleReviewResult | null)
ALTER TABLE stories ADD COLUMN style_review_state TEXT;
