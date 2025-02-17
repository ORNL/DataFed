import React, { useState, useEffect } from "react"
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Select, MenuItem } from "@mui/material"
import * as settings from "../settings.js"
import * as util from "../util.js"
import * as api from "../api.js"
import * as dialogs from "../dialogs.js"
import { ConfirmChoiceDialog } from "./dialogs/ConfirmChoiceDialog"
import { AlertDialog } from "./dialogs/AlertDialog"

interface SettingsDialogProps {
  isOpen: boolean
  onClose: (reload: boolean) => void
}

const SettingsDialog: React.FC<SettingsDialogProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState(settings?.user.email)
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [pageSize, setPageSize] = useState(settings.opts.page_sz)
  const [taskPollHours, setTaskPollHours] = useState(settings.opts.task_hist)
  const [theme, setTheme] = useState(settings.theme)
  const [metaVal, setMetaVal] = useState(settings.opts.meta_val)
  const [defaultAlloc, setDefaultAlloc] = useState("none")
  const [allocOptions, setAllocOptions] = useState<{ repo: string; dataSize: number; dataLimit: number }[]>([])

  useEffect(() => {
    api.allocListBySubject(null, null, (ok, data) => {
      if (ok && data.length) {
        setAllocOptions(data)
        setDefaultAlloc(data[0].repo)
      }
    })
  }, [])

  const handleSave = () => {
    let reload = false
    if (newPassword && newPassword !== confirmPassword) {
      return (
        <AlertDialog
          title={"Update CLI Password"}
          message={"Passwords do not match"}
          isOpen={false}
          onClose={function (): void {
            throw new Error("Function not implemented.")
          }}
        />
      )
    }

    const opts = { ...settings.opts, page_sz: pageSize, task_hist: taskPollHours, meta_val: metaVal }
    if (email !== settings.user.email || newPassword || JSON.stringify(opts) !== JSON.stringify(settings.opts)) {
      api.userUpdate(`u/${settings.user.uid}`, newPassword, email, opts, (ok, data) => {
        if (!ok) {
          return <AlertDialog title={"Save Settings Error"} {...data} />
        } else {
          util.setStatusText("Settings saved.")
          onClose(reload)
        }
      })
    }

    if (theme !== settings.theme) {
      settings.setTheme(theme)
      api.themeSave(theme, (ok, data) => {
        if (!ok) {
          return <AlertDialog title={"Save Theme Error"} {...data} />
        } else {
          reload = true
          onClose(reload)
        }
      })
    }

    if (defaultAlloc !== "none") {
      api.setDefaultAlloc(defaultAlloc, null, (ok, data) => {
        if (!ok) {
          return <AlertDialog title={"Set Default Allocation Error"} {...data} />
        } else {
          onClose(reload)
        }
      })
    }
  }

  return (
    <Dialog open={isOpen} onClose={() => onClose(false)}>
      <DialogTitle>DataFed Settings</DialogTitle>
      <DialogContent>
        <div>User Interface</div>
        <hr />
        <Select value={taskPollHours} onChange={(e) => setTaskPollHours(Number(e.target.value))}>
          <MenuItem value={1}>1 Hour</MenuItem>
          <MenuItem value={12}>12 Hours</MenuItem>
          <MenuItem value={24}>1 Day</MenuItem>
          <MenuItem value={168}>1 Week</MenuItem>
          <MenuItem value={720}>1 Month</MenuItem>
        </Select>
        <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
          <MenuItem value={10}>10</MenuItem>
          <MenuItem value={20}>20</MenuItem>
          <MenuItem value={50}>50</MenuItem>
          <MenuItem value={100}>100</MenuItem>
        </Select>
        <Select value={theme} onChange={(e) => setTheme(e.target.value as string)}>
          <MenuItem value="light">Light</MenuItem>
          <MenuItem value="dark">Dark</MenuItem>
        </Select>
        <Select value={metaVal} onChange={(e) => setMetaVal(Number(e.target.value))}>
          <MenuItem value={0}>Warn</MenuItem>
          <MenuItem value={1}>Error</MenuItem>
        </Select>
        <div>Account Settings</div>
        <hr />
        <Select value={defaultAlloc} onChange={(e) => setDefaultAlloc(e.target.value as string)}>
          {allocOptions.map((alloc) => (
            <MenuItem key={alloc.repo} value={alloc.repo}>
              {alloc.repo.substr(5)} ({util.sizeToString(alloc.dataSize)} / {util.sizeToString(alloc.dataLimit)})
            </MenuItem>
          ))}
        </Select>
        <TextField label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>Command-Line Interface</div>
        <hr />
        <TextField
          type="password"
          label="New password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <TextField
          type="password"
          label="Confirm"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        <Button
          onClick={() => {
            return (
              <ConfirmChoiceDialog
                title={"Revoke CLI Credentials"}
                message={
                  "Revoke credentials for ALL configured environments? The SDMS CLI will revert to interactive mode " +
                  "until new credentials are configured using the CLI 'setup' command."
                }
                buttons={["Cancel", "Revoke"]}
                onSelect={(choice) => {
                  if (choice === 1) {
                    api.userRevokeCredentials((ok, data) => {
                      if (!ok) dialogs.dlgAlert("Revoke Credentials Error", data)
                    })
                  }
                }}
                isOpen={true}
                onClose={() => console.log("hi")}
              />
            )
          }}
        >
          Revoke Credentials
        </Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => onClose(false)}>Cancel</Button>
        <Button onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}

export default SettingsDialog
