export type KeywordInfo = {
  term: string;
  explanation: string;
};

export type QuestType = "main" | "side" | "boss";

export type TaskNode = {
  title: string;
  description?: string;
  how?: string;
  hint?: string;
  questType?: QuestType;
  keywords?: KeywordInfo[];
  difficulty?: "simple" | "medium" | "hard";
  completed?: boolean;
  children?: TaskNode[];
};
