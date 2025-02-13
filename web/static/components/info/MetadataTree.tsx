import React, { useState } from 'react';
import { Box, TextField, Button } from '@mui/material';
import { TreeView, TreeItem } from '@mui/lab';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import * as util from '../../util';

interface MetadataTreeProps {
  metadata: string;
  error?: string;
  expanded: Record<string, number>;
  onExpandedChange: (expanded: Record<string, number>) => void;
}

export const MetadataTree: React.FC<MetadataTreeProps> = ({
  metadata,
  error,
  expanded,
  onExpandedChange
}) => {
  const [filterText, setFilterText] = useState('');
  
  const handleNodeToggle = (nodeId: string) => {
    onExpandedChange({
      ...expanded,
      [nodeId]: expanded[nodeId] ? expanded[nodeId] - 1 : 10
    });
  };

  const renderTree = (nodes: any, path = '') => {
    return Object.entries(nodes).map(([key, value]: [string, any]) => {
      const nodeId = path ? `${path}.${key}` : key;
      const isObject = value && typeof value === 'object';
      
      return (
        <TreeItem 
          key={nodeId}
          nodeId={nodeId}
          label={`${key}: ${isObject ? '' : String(value)}`}
        >
          {isObject && renderTree(value, nodeId)}
        </TreeItem>
      );
    });
  };

  const metadata_obj = JSON.parse(metadata);

  return (
    <Box p={2}>
      <Box mb={2}>
        <TextField
          size="small"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter metadata..."
        />
        <Button onClick={() => setFilterText('')}>Clear</Button>
      </Box>

      {error && (
        <Box color="error.main" mb={2}>
          {error}
        </Box>
      )}

      <TreeView
        defaultCollapseIcon={<ExpandMoreIcon />}
        defaultExpandIcon={<ChevronRightIcon />}
        expanded={Object.keys(expanded)}
        onNodeToggle={(e, nodeIds) => {
          nodeIds.forEach(handleNodeToggle);
        }}
      >
        {renderTree(metadata_obj)}
      </TreeView>
    </Box>
  );
};
