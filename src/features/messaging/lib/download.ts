/**
 * Opens a file's link in a new tab, through a link clicked here: this page
 * never navigates (no leave-page prompt, nothing of the app lost). A link
 * answering `inline` shows the file there ("Mở tab mới", C-42).
 */
export function openInNewTab(url: string): void {
    const link = document.createElement('a')
    link.href = url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.click()
}

/**
 * Saves a file from its link (one answering `attachment`): the browser
 * downloads it in the tab it opens, and closes that tab.
 */
export function startDownload(url: string): void {
    openInNewTab(url)
}
