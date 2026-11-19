import React from 'react';
import { Article, ReviewProject } from '../types';
import { ResearchBriefingModule } from './ResearchBriefingModule';

interface NotebookStudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ReviewProject;
  articles: Article[];
  preselectedIds?: Set<string>;
  onUpdateArticles: (updated: Article[]) => void;
}

export const NotebookStudioModal: React.FC<NotebookStudioModalProps> = ({
  isOpen,
  onClose,
  project,
  articles,
  preselectedIds,
  onUpdateArticles,
}) => {
  if (!isOpen) return null;

  return (
    <ResearchBriefingModule
      project={project}
      articles={articles}
      preselectedIds={preselectedIds}
      onUpdateArticles={onUpdateArticles}
      initialFullscreen={true}
      onCloseFullscreen={onClose}
    />
  );
};
