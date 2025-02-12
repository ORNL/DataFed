import React, { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material';
import { Fancytree, FancytreeNode } from 'react-fancytree';
import * as api from './api';
import * as util from './util';
import * as settings from './settings';

interface ProjectPickerProps {
  exclude: string[];
  singleSelect: boolean;
  onClose: (selected: string[]) => void;
}

const ProjectPicker: React.FC<ProjectPickerProps> = ({ exclude, singleSelect, onClose }) => {
  const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
  const [open, setOpen] = useState(true);

  const handleSelect = (event: any, data: any) => {
    const selectedKeys = data.tree.getSelectedNodes().map((node: FancytreeNode) => node.key);
    setSelectedProjects(selectedKeys);
  };

  const handleClose = () => {
    setOpen(false);
    onClose(selectedProjects);
  };

  const treeData = [
    { title: 'All By ID', key: 'all-id', folder: true, lazy: true },
    { title: 'All By Title', key: 'all-title', folder: true, lazy: true },
  ];

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>Select Project(s)</DialogTitle>
      <DialogContent>
        <Fancytree
          source={treeData}
          checkbox={!singleSelect}
          selectMode={singleSelect ? 1 : 2}
          lazyLoad={(event, data) => {
            data.result = {
              url: api.projList_url(
                false,
                false,
                false,
                data.node.key === 'all-id' ? 'id' : 'title',
                data.node.data.offset,
                settings.opts.page_sz,
              ),
              cache: false,
            };
          }}
          select={handleSelect}
          renderNode={(event, data) => {
            if (data.node.data.hasBtn) {
              // Handle pagination buttons
            }
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="primary">
          Cancel
        </Button>
        <Button onClick={handleClose} color="primary" disabled={selectedProjects.length === 0}>
          Ok
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ProjectPicker;