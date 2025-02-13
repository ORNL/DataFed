import React, { useState, useEffect, useCallback } from 'react';
import { Box, Typography, Button } from '@mui/material';
import { TopicNavigation } from './TopicNavigation';
import { TopicList } from './TopicList';
import { CollectionList } from './CollectionList'; 
import { CollectionTree } from './CollectionTree';
import { SearchPanel } from './SearchPanel';
import * as api from '../../api';
import * as model from '../../model';
import * as util from '../../util';

interface Topic {
  id: string;
  title: string;
}

interface CatalogPanelProps {
  onSelectionChange: () => void;
  onItemSelect: (item: any) => void;
}

export const CatalogPanel: React.FC<CatalogPanelProps> = ({
  onSelectionChange,
  onItemSelect
}) => {
  const [currentTopic, setCurrentTopic] = useState<Topic[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [showCollectionTree, setShowCollectionTree] = useState(false);
  const [offset, setOffset] = useState(0);
  const [userTags, setUserTags] = useState<string[]>([]);

  const loadTopics = useCallback(async (topicId?: string) => {
    setLoading(true);
    try {
      const data = await api.topicListTopics(topicId, null, null);
      setTopics(data.topic || []);
    } catch (err) {
      console.error('Failed to load topics:', err);
    }
    setLoading(false);
  }, []);

  const loadCollections = useCallback(async () => {
    setLoading(true);
    try {
      const query = {
        published: true,
        offset,
        count: 20, // TODO: Get from settings
        catTags: currentTopic.map(t => t.title),
        mode: model.SM_COLLECTION
      };
      const data = await api.dataSearch(query);
      setCollections(data.item || []);
    } catch (err) {
      console.error('Failed to load collections:', err);
    }
    setLoading(false);
  }, [currentTopic, offset]);

  useEffect(() => {
    loadTopics();
    loadCollections();
  }, []);

  const handleTopicSelect = useCallback((topic: Topic) => {
    setCurrentTopic(prev => [...prev, topic]);
    loadTopics(topic.id);
    setOffset(0);
    loadCollections();
  }, [loadTopics, loadCollections]);

  const handleBack = useCallback(() => {
    if (showCollectionTree) {
      setShowCollectionTree(false);
      setSelectedCollection(null);
    } else if (currentTopic.length) {
      setCurrentTopic(prev => prev.slice(0, -1));
      loadTopics(currentTopic[currentTopic.length - 2]?.id);
      setOffset(0);
      loadCollections();
    }
  }, [showCollectionTree, currentTopic, loadTopics, loadCollections]);

  const handleCollectionSelect = useCallback((collectionId: string) => {
    setSelectedCollection(collectionId);
    onItemSelect(collections.find(c => c.id === collectionId));
  }, [collections, onItemSelect]);

  const handleCollectionOpen = useCallback((collectionId: string) => {
    setSelectedCollection(collectionId);
    setShowCollectionTree(true);
  }, []);

  return (
    <Box>
      <TopicNavigation 
        currentTopic={currentTopic}
        onBack={handleBack}
        onHome={() => {
          setCurrentTopic([]);
          setShowCollectionTree(false);
          setSelectedCollection(null);
          loadTopics();
          setOffset(0);
          loadCollections();
        }}
      />

      {loading ? (
        <Typography>Loading...</Typography>
      ) : showCollectionTree ? (
        <CollectionTree
          collectionId={selectedCollection!}
          onSelect={handleCollectionSelect}
        />
      ) : (
        <>
          <TopicList
            topics={topics}
            onSelect={handleTopicSelect}
          />
          <CollectionList 
            collections={collections}
            selectedId={selectedCollection}
            onSelect={handleCollectionSelect}
            onOpen={handleCollectionOpen}
          />
        </>
      )}

      <SearchPanel
        tags={userTags}
        onTagsChange={setUserTags}
        onSearch={loadCollections}
      />
    </Box>
  );
};
