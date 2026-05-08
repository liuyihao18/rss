export type FeedSource = {
  name: string;
  url: string;
  siteUrl: string;
  category?: string;
};

export const FEED_SOURCES: FeedSource[] = [
  {
    name: "OpenAI News",
    url: "https://openai.com/news/rss.xml",
    siteUrl: "https://openai.com/news/"
  },
  {
    name: "Anthropic News",
    url: "https://www.anthropic.com/news/rss.xml",
    siteUrl: "https://www.anthropic.com/news"
  },
  {
    name: "Google DeepMind",
    url: "https://deepmind.google/discover/blog/rss.xml",
    siteUrl: "https://deepmind.google/discover/blog/"
  },
  {
    name: "Google AI Blog",
    url: "https://blog.google/technology/ai/rss/",
    siteUrl: "https://blog.google/technology/ai/"
  },
  {
    name: "Hugging Face Blog",
    url: "https://huggingface.co/blog/feed.xml",
    siteUrl: "https://huggingface.co/blog"
  },
  {
    name: "Meta AI",
    url: "https://ai.meta.com/blog/rss/",
    siteUrl: "https://ai.meta.com/blog/"
  },
  {
    name: "MIT News AI",
    url: "https://news.mit.edu/rss/topic/artificial-intelligence2",
    siteUrl: "https://news.mit.edu/topic/artificial-intelligence2"
  },
  {
    name: "The Batch",
    url: "https://www.deeplearning.ai/the-batch/feed/",
    siteUrl: "https://www.deeplearning.ai/the-batch/"
  },
  {
    name: "VentureBeat AI",
    url: "https://venturebeat.com/category/ai/feed/",
    siteUrl: "https://venturebeat.com/category/ai/"
  },
  {
    name: "TechCrunch AI",
    url: "https://techcrunch.com/category/artificial-intelligence/feed/",
    siteUrl: "https://techcrunch.com/category/artificial-intelligence/"
  }
];
