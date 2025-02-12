import React, { useState } from 'react';
import { Chip, TextField, Box } from '@mui/material';

interface TagInputProps {
    tags: string[];
    onChange: (tags: string[]) => void;
    disabled?: boolean;
}

export const TagInput: React.FC<TagInputProps> = ({ tags, onChange, disabled }) => {
    const [input, setInput] = useState('');

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' && input.trim()) {
            event.preventDefault();
            const newTag = input.trim();
            if (!tags.includes(newTag)) {
                onChange([...tags, newTag]);
            }
            setInput('');
        }
    };

    const handleDelete = (tagToDelete: string) => {
        onChange(tags.filter(tag => tag !== tagToDelete));
    };

    return (
        <Box>
            <TextField
                label="Tags"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={disabled}
                fullWidth
                helperText="Press Enter to add a tag"
            />
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                {tags.map((tag) => (
                    <Chip
                        key={tag}
                        label={tag}
                        onDelete={disabled ? undefined : () => handleDelete(tag)}
                    />
                ))}
            </Box>
        </Box>
    );
};
