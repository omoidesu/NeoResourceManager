import { nextTick } from 'vue'
import type { ComputedRef, Ref } from 'vue'

type NotifyType = 'success' | 'error' | 'info' | 'warning' | 'warn' | string

type ScriptRuntime = { label: string; value: string; shellType: 'powershell' | 'cmd' }

type Deps = {
  formData: Ref<any>
  basePathFormItemRef: Ref<any>
  showSoftwareScriptModal: Ref<boolean>
  softwareScriptDraft: Ref<string>
  softwareScriptRuntimePath: Ref<string>
  softwareScriptRuntimes: Ref<ScriptRuntime[]>
  softwareScriptShellType: ComputedRef<'powershell' | 'cmd'>
  showNotifyByType: (type: NotifyType, title: string, content: string) => void
}

export const useCategoryEditorSoftwareScript = (deps: Deps) => {
  const normalizeSoftwareScript = (script: string) => {
    return String(script ?? '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
  }

  const normalizeSoftwareScriptForShell = (script: string, shellType: 'powershell' | 'cmd') => {
    const lines = normalizeSoftwareScript(script)
    return lines.join(shellType === 'cmd' ? ' && ' : '; ')
  }

  const denormalizeSoftwareScript = (command: string) => {
    return String(command ?? '')
      .replace(/\s*&&\s*/g, '\n')
      .replace(/\s*;\s*/g, '\n')
      .trim()
  }

  const resolveSoftwareScriptShell = (basePath: string) => {
    const normalizedPath = String(basePath ?? '').replace(/\\/g, '/').toLowerCase()
    return normalizedPath.endsWith('/powershell.exe') || normalizedPath.endsWith('/pwsh.exe') ? 'powershell' : 'cmd'
  }

  const ensureSoftwareScriptRuntimes = async () => {
    const runtimes = await window.api.dialog.getAvailableScriptRuntimes()
    deps.softwareScriptRuntimes.value = Array.isArray(runtimes) ? runtimes : []
    return deps.softwareScriptRuntimes.value
  }

  const handleConfirmSoftwareScript = async () => {
    const normalizedCommand = normalizeSoftwareScriptForShell(deps.softwareScriptDraft.value, deps.softwareScriptShellType.value)
    if (!normalizedCommand) {
      deps.showNotifyByType('warning', '脚本执行', '请先输入至少一条命令')
      return
    }

    if (!String(deps.softwareScriptRuntimePath.value ?? '').trim()) {
      deps.showNotifyByType('warning', '脚本执行', '请先选择脚本运行器')
      return
    }

    deps.formData.value.basePath = deps.softwareScriptRuntimePath.value
    deps.formData.value.meta = {
      ...(deps.formData.value.meta ?? {}),
      commandLineArgs: normalizedCommand
    }

    if (!String(deps.formData.value.name ?? '').trim() || String(deps.formData.value.name ?? '').trim().toLowerCase() === 'cmd') {
      deps.formData.value.name = '脚本启动'
    }

    deps.showSoftwareScriptModal.value = false
    await nextTick()
    await deps.basePathFormItemRef.value?.validate({ trigger: 'change' })
  }

  return {
    ensureSoftwareScriptRuntimes,
    resolveSoftwareScriptShell,
    denormalizeSoftwareScript,
    handleConfirmSoftwareScript
  }
}
