import { Fragment, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { parseMessage, type Block, type Inline } from '../lib/markdown'
import type { AppLink } from '../types'
import { MessageLinkChip } from './MessageLinkChip'

type ReadLink = (href: string) => AppLink | null

const LINK = 'text-primary underline'

/**
 * A message's text with its formatting (REQ-MSG-02, C-10): bold, italic,
 * strikethrough, inline code and code blocks (JetBrains Mono on `surface-2`,
 * a block scrolling sideways), quotes (a 4-wide `border-input` rule on the
 * left) and links (`primary`, underlined). A link to a page of the app opens
 * in this tab, a message link as a chip; another site opens in a new tab
 * (D-117). Line breaks are kept. `trailing` ("(edited)") ends the last line.
 */
export function MessageContent({
    content,
    readLink,
    trailing
}: {
    content: string
    readLink: ReadLink
    trailing?: ReactNode
}) {
    const blocks = useMemo(() => parseMessage(content), [content])
    const last = blocks.at(-1)
    const endsInText = last !== undefined && last.type !== 'codeBlock'

    return (
        <div className='break-words text-body text-text-primary'>
            {blocks.map((block, index) => (
                <BlockView
                    key={index}
                    block={block}
                    readLink={readLink}
                    trailing={endsInText && index === blocks.length - 1 ? trailing : undefined}
                />
            ))}
            {trailing && !endsInText ? <p>{trailing}</p> : null}
        </div>
    )
}

function BlockView({ block, readLink, trailing }: { block: Block; readLink: ReadLink; trailing?: ReactNode }) {
    if (block.type === 'codeBlock') {
        return (
            <pre className='my-1 overflow-x-auto rounded-input bg-surface-2 px-3 py-2 font-mono text-mono-code'>
                <code>{block.text}</code>
            </pre>
        )
    }
    const parts = (
        <>
            <Parts parts={block.children} readLink={readLink} />
            {trailing ? <> {trailing}</> : null}
        </>
    )
    if (block.type === 'quote') {
        return <blockquote className='my-1 whitespace-pre-wrap border-l-4 border-border-input pl-3'>{parts}</blockquote>
    }
    return <p className='whitespace-pre-wrap'>{parts}</p>
}

function Parts({ parts, readLink }: { parts: Inline[]; readLink: ReadLink }) {
    return parts.map((part, index) => (
        <Fragment key={index}>
            <Part part={part} readLink={readLink} />
        </Fragment>
    ))
}

function Part({ part, readLink }: { part: Inline; readLink: ReadLink }) {
    switch (part.type) {
        case 'text':
            return part.text
        case 'bold':
            return (
                <strong className='font-semibold'>
                    <Parts parts={part.children} readLink={readLink} />
                </strong>
            )
        case 'italic':
            return (
                <em>
                    <Parts parts={part.children} readLink={readLink} />
                </em>
            )
        case 'strike':
            return (
                <s>
                    <Parts parts={part.children} readLink={readLink} />
                </s>
            )
        case 'code':
            return <code className='rounded-badge bg-surface-2 px-1 font-mono text-mono-code'>{part.text}</code>
        case 'link':
            return <LinkPart href={part.href} readLink={readLink} />
    }
}

function LinkPart({ href, readLink }: { href: string; readLink: ReadLink }) {
    const link = readLink(href)
    if (!link) {
        return (
            <a href={href} target='_blank' rel='noopener noreferrer' className={LINK}>
                {href}
            </a>
        )
    }
    if (link.kind === 'page') {
        return (
            <Link to={link.to} className={LINK}>
                {href}
            </Link>
        )
    }
    return <MessageLinkChip link={link} />
}
