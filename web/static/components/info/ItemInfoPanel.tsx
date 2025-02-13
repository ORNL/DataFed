import React, { useState, useEffect } from 'react';
import { Box, Tabs, Tab, Typography } from '@mui/material';
import { ItemDetails } from './ItemDetails';
import { MetadataTree } from './MetadataTree';
import { AnnotationTabs } from './AnnotationTabs';
import * as api from '../../api';
import * as model from '../../model';
import * as util from '../../util';

interface ItemData {
  id: string;
  title: string;
  desc?: string;
  metadata?: string;
  mdErrMsg?: string;
  notes?: number;
  [key: string]: any;
}

export const ItemInfoPanel: React.FC = () => {
  const [currentItem, setCurrentItem] = useState<ItemData | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [metadataExpanded, setMetadataExpanded] = useState<Record<string, number>>({});

  const handleTabChange = (event: React.SyntheticEvent, newValue: number) => {
    setActiveTab(newValue);
  };

  const showSelectedInfo = async (id: string | null) => {
    if (!id) {
      setCurrentItem(null);
      return;
    }

    try {
      let data;
      if (id.startsWith('c/')) {
        data = await api.collView(id);
      } else if (id.startsWith('d/')) {
        data = await api.dataView(id);
      } else if (id.startsWith('task/')) {
        data = await api.taskView(id);
      } else if (id.startsWith('t/')) {
        data = await api.topicView(id);
      }
      setCurrentItem(data);
    } catch (err) {
      console.error('Failed to load item:', err);
    }
  };

  return (
    <Box>
      {currentItem ? (
        <>
          <Typography variant="h6">{currentItem.title}</Typography>
          
          <Tabs value={activeTab} onChange={handleTabChange}>
            <Tab label="Details" />
            {currentItem.metadata && <Tab label="Metadata" />}
            {currentItem.notes && <Tab label="Annotations" />}
          </Tabs>

          {activeTab === 0 && (
            <ItemDetails item={currentItem} />
          )}

          {activeTab === 1 && currentItem.metadata && (
            <MetadataTree 
              metadata={currentItem.metadata}
              error={currentItem.mdErrMsg}
              expanded={metadataExpanded}
              onExpandedChange={setMetadataExpanded}
            />
          )}

          {activeTab === 2 && currentItem.notes && (
            <AnnotationTabs
              subjectId={currentItem.id} 
            />
          )}
        </>
      ) : (
        <Typography>
          Select an item in left-hand panels to view additional information.
        </Typography>
      )}
    </Box>
  );
};
