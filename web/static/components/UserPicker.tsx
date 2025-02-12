import React, { useState, useEffect, useCallback } from 'react';
import { useDebounce } from './hooks/useDebounce';
import { userFindByName_url } from '../api';
import {
  Dialog,
  Input,
  Button,
  Tree
} from '@mui/material';

interface UserPickerProps {
  uid: string;
  exclude: string[];
  singleSelect: boolean;
  onClose: (selectedUsers: string[]) => void;
}

const UserPicker: React.FC<UserPickerProps> = ({ uid, exclude, singleSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUsers, setSelectedUsers] = useState<Record<string, string>>({});
  const [userTreeData, setUserTreeData] = useState<any[]>([]); // Define a proper type for tree data
  const debouncedSearchTerm = useDebounce(searchTerm, 500);

  useEffect(() => {
    // Load initial tree data
    setUserTreeData([
      { title: 'Collaborators', key: 'collab', children: [] },
      { title: 'By Groups', key: 'groups', children: [] },
      { title: 'All', key: 'all', children: [] },
      { title: 'Search Results', key: 'search', children: [] },
    ]);
  }, []);

  useEffect(() => {
    if (debouncedSearchTerm) {
      // Fetch search results
      userFindByName_url(debouncedSearchTerm, 0, 20).then((results) => {
        console.log("res", results); // Update tree data with search results
      });
    }
  }, [debouncedSearchTerm]);

  const handleSelectUser = useCallback((key: string, title: string) => {
    setSelectedUsers((prev) => ({ ...prev, [key]: title }));
  }, []);

  const handleRemoveSelected = useCallback((key: string) => {
    setSelectedUsers((prev) => {
      const newSelected = { ...prev };
      delete newSelected[key];
      return newSelected;
    });
  }, []);

  const handleOk = () => {
    onClose(Object.keys(selectedUsers));
  };

  return (
    <Dialog title="Select User(s)" onClose={() => onClose([])}>
      <div>
        <Input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search..."
        />
        <Tree
          data={userTreeData}
          onSelect={handleSelectUser}
          selectedKeys={Object.keys(selectedUsers)}
        />
        <div>
          <h3>Selected Users</h3>
          <ul>
            {Object.entries(selectedUsers).map(([key, title]) => (
              <li key={key}>
                {title} <Button onClick={() => handleRemoveSelected(key)}>Remove</Button>
              </li>
            ))}
          </ul>
        </div>
        <Button onClick={handleOk} disabled={!Object.keys(selectedUsers).length}>
          Ok
        </Button>
      </div>
    </Dialog>
  );
};

export default UserPicker;