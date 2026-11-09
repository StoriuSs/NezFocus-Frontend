/**
 * What the API takes as a picture (an avatar, REQ-AUTH-06; a server icon,
 * REQ-SRV-01): JPG, PNG or WEBP up to 8 MB. Checked here first, so a wrong
 * file never opens the cropper.
 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const IMAGE_MAX_BYTES = 8 * 1024 * 1024

export type ImageProblem = 'wrongType' | 'tooLarge'

/** Why the file cannot be used, or null when it can. */
export function imageProblem(file: File): ImageProblem | null {
    if (!IMAGE_TYPES.includes(file.type)) return 'wrongType'
    if (file.size > IMAGE_MAX_BYTES) return 'tooLarge'
    return null
}
