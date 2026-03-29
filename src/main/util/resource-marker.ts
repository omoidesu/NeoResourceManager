import crypto from 'crypto'
import path from 'path'
import fs from 'fs'

export type ResourceMarkerEntry = {
  name: string
  fingerprint: string
}

export type ResourceMarkerPayload = {
  version: 1
  resourceId: string
  files: ResourceMarkerEntry[]
}

/**
 * 返回资源目录下的 .nrm 目录路径。
 */
export function getMarkerDirectory(basePath: string) {
  return path.join(basePath, '.nrm')
}

/**
 * 返回某个资源对应的 marker 文件路径。
 * 新格式为：.nrm/<resourceId>
 */
export function getMarkerFilePath(basePath: string, resourceId: string) {
  return path.join(getMarkerDirectory(basePath), resourceId)
}

/**
 * 返回某个资源可能存在的 marker 文件路径。
 * 部分隐藏文件实现会把文件名改成 ".<resourceId>"，因此这里同时兼容两种命名。
 */
export function getMarkerFilePathCandidates(basePath: string, resourceId: string) {
  return [
    getMarkerFilePath(basePath, resourceId),
    path.join(getMarkerDirectory(basePath), `.${resourceId}`),
  ]
}

/**
 * 构建资源 marker 内容。
 * 当前只记录入口文件名及其指纹，目录资源暂时保留空列表。
 */
export async function buildResourceMarkerPayload(
  resourceId: string,
  basePath: string,
  fileName: string | null
): Promise<ResourceMarkerPayload> {
  const files: ResourceMarkerEntry[] = []

  if (fileName) {
    const targetPath = path.join(basePath, fileName)
    if (fs.existsSync(targetPath)) {
      files.push({
        name: fileName,
        fingerprint: await createFileFingerprint(targetPath),
      })
    }
  }

  return {
    version: 1,
    resourceId,
    files,
  }
}

/**
 * 读取 marker 文件内容。
 */
export async function readResourceMarkerPayload(markerPath: string) {
  try {
    const raw = await fs.promises.readFile(markerPath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<ResourceMarkerPayload>

    if (!parsed || typeof parsed.resourceId !== 'string' || !Array.isArray(parsed.files)) {
      return null
    }

    return {
      version: 1,
      resourceId: parsed.resourceId,
      files: parsed.files
        .filter((entry) => entry && typeof entry.name === 'string' && typeof entry.fingerprint === 'string')
        .map((entry) => ({
          name: entry.name,
          fingerprint: entry.fingerprint,
        })),
    } satisfies ResourceMarkerPayload
  } catch {
    return null
  }
}

/**
 * 创建轻量文件指纹。
 * 指纹由文件大小、修改时间、头部 64KB 与尾部 64KB 共同生成，
 * 用于后续资源定位与单图资源处理。
 */
export async function createFileFingerprint(filePath: string) {
  const stat = await fs.promises.stat(filePath)
  const hash = crypto.createHash('sha1')
  const handle = await fs.promises.open(filePath, 'r')

  try {
    const chunkSize = 64 * 1024
    const headSize = Math.min(Number(stat.size), chunkSize)
    const tailOffset = Math.max(0, Number(stat.size) - chunkSize)
    const tailSize = Math.min(Number(stat.size), chunkSize)

    const headBuffer = Buffer.alloc(headSize)
    const tailBuffer = Buffer.alloc(tailSize)

    if (headSize > 0) {
      await handle.read(headBuffer, 0, headSize, 0)
    }

    if (tailSize > 0) {
      await handle.read(tailBuffer, 0, tailSize, tailOffset)
    }

    hash.update(String(stat.size))
    hash.update(':')
    hash.update(String(Math.floor(stat.mtimeMs)))
    hash.update(':')
    hash.update(headBuffer)
    hash.update(':')
    hash.update(tailBuffer)

    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}
