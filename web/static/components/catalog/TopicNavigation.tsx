import React from "react"
import { Box, Button, Typography } from "@mui/material"
import HomeIcon from "@mui/icons-material/Home"
import ArrowBackIcon from "@mui/icons-material/ArrowBack"

interface Topic {
  id: string
  title: string
}

interface TopicNavigationProps {
  currentTopic: Topic[]
  onBack: () => void
  onHome: () => void
}

export const TopicNavigation: React.FC<TopicNavigationProps> = ({ currentTopic, onBack, onHome }) => {
  return (
    <Box sx={{ display: "flex", alignItems: "center", mb: 2 }}>
      <Button startIcon={<HomeIcon />} onClick={onHome} sx={{ mr: 1 }}>
        Home
      </Button>

      <Button startIcon={<ArrowBackIcon />} onClick={onBack} disabled={!currentTopic.length} sx={{ mr: 2 }}>
        Back
      </Button>

      <Typography>{currentTopic.length ? currentTopic.map((t) => t.title).join(" > ") : "Home"}</Typography>
    </Box>
  )
}
