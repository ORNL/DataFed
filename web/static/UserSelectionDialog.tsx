import React, { useState, useEffect } from 'react';
import { Dialog, Button, Input } from '@material-ui/core';
import { TreeView, TreeItem } from '@material-ui/lab';
import * as api from './api';
import * as util from './util';
import * as settings from './settings';

interface User {
  uid: string;
  nameFirst: string;
  nameLast: string;
}

interface Group {
  gid: string;
  title: string;
  member: string[];
}

interface UserSelectionDialogProps {
  a_uid: string;
  a_excl: string[];
  a_single_sel: boolean;
  onClose: (selectedUsers: string[]) => void;
}

const UserSelectionDialog: React.FC<UserSelectionDialogProps> = ({ a_uid, a_excl, a_single_sel, onClose }) => {
  const [selUsers, setSelUsers] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');
  const [userTreeData, setUserTreeData] = useState<any[]>([]);

  useEffect(() => {
    // Load initial tree data
    setUserTreeData([
      { title: 'Collaborators', key: 'collab', offset: 0 },
      { title: 'By Groups', key: 'groups', offset: 0 },
      { title: 'All', key: 'all', offset: 0 },
      { title: 'Search Results', key: 'search', offset: 0 },
    ]);
  }, []);

  const handleSearchInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleUserSelect = (event: React.ChangeEvent<{}>, nodeIds: string[]) => {
    const newSelUsers = { ...selUsers };
    nodeIds.forEach(id => {
      if (newSelUsers[id]) {
        delete newSelUsers[id];
      } else {
        newSelUsers[id] = id; // Assuming id is the user title for simplicity
      }
    });
    setSelUsers(newSelUsers);
  };

  const handleOk = () => {
    onClose(Object.keys(selUsers));
  };

  return (
    <Dialog open={true} onClose={() => onClose([])} fullWidth maxWidth="sm">
      <div style={{ padding: '1em' }}>
        <div style={{ marginBottom: '1em' }}>
          <Input
            fullWidth
            placeholder="Search"
            value={searchTerm}
            onChange={handleSearchInputChange}
          />
        </div>
        <TreeView
          multiSelect={!a_single_sel}
          selected={Object.keys(selUsers)}
          onNodeSelect={handleUserSelect}
        >
          {userTreeData.map(node => (
            <TreeItem key={node.key} nodeId={node.key} label={node.title}>
              {/* Render child nodes here */}
            </TreeItem>
          ))}
        </TreeView>
        <div style={{ marginTop: '1em', textAlign: 'right' }}>
          <Button onClick={() => onClose([])}>Cancel</Button>
          <Button onClick={handleOk} color="primary" variant="contained" disabled={!Object.keys(selUsers).length}>
            Ok
          </Button>
        </div>
      </div>
    </Dialog>
  );
};

export default UserSelectionDialog;
