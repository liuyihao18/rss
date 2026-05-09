-- Add translation fields to Article
ALTER TABLE "Article" ADD COLUMN "aiTranslation" TEXT;
ALTER TABLE "Article" ADD COLUMN "aiTranslationError" TEXT;
ALTER TABLE "Article" ADD COLUMN "aiTranslationGeneratedAt" DATETIME;
ALTER TABLE "Article" ADD COLUMN "aiTranslationSourceHash" TEXT;
