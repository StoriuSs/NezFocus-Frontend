import { Fragment, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { parseMessage, type Block, type Inline } from '../lib/markdown'
import type { AppLink } from '../types'
import { MentionChip, type ContentMentions } from './MentionChip'
import { MessageLinkChip } from './MessageLinkChip'

type ReadLink = (href: string) => AppLink | null

/** What the parts of a message are drawn with: how links show, and its mentions' names. */
interface Drawing {
    readLink: ReadLink
    mentions: ContentMentions
}

const LINK = 'text-primary underline'

/**
 * A message's text with its formatting (REQ-MSG-02, C-10): bold, italic,
 * strikethrough, inline code and code blocks (JetBrains Mono on `surface-2`,
 * a block scrolling sideways), quotes (a 4-wide `border-input` rule on the
 * left) and links (`primary`, underlined). A link to a page of the app opens
 * in this tab, a message link as a chip; another site opens in a new tab
 * (D-117). Mentions are chips (`MentionChip`, REQ-MSG-03). Line breaks are
 * kept. `trailing` ("(edited)") ends the last line.
 */
export function MessageContent({
    content,
    readLink,
    mentions,
    trailing
}: {
    content: string
    readLink: ReadLink
    mentions: ContentMentions
    trailing?: ReactNode
}) {
    const blocks = useMemo(() => parseMessage(content), [content])
    const drawing = { readLink, mentions }
    const last = blocks.at(-1)
    const endsInText = last !== undefined && last.type !== 'codeBlock'

    return (
        <div className='break-words text-body text-text-primary'>
            {blocks.map((block, index) => (
                <BlockView
                    key={index}
                    block={block}
                    drawing={drawing}
                    trailing={endsInText && index === blocks.length - 1 ? trailing : undefined}
                />
            ))}
            {trailing && !endsInText ? <p>{trailing}</p> : null}
        </div>
    )
}

function BlockView({ block, drawing, trailing }: { block: Block; drawing: Drawing; trailing?: ReactNode }) {
    if (block.type === 'codeBlock') {
        return (
            <pre className='my-1 overflow-x-auto rounded-input bg-surface-2 px-3 py-2 font-mono text-mono-code'>
                <code>{block.text}</code>
            </pre>
        )
    }
    const parts = (
        <>
            <Parts parts={block.children} drawing={drawing} />
            {trailing ? <> {trailing}</> : null}
        </>
    )
    if (block.type === 'quote') {
        return <blockquote className='my-1 whitespace-pre-wrap border-l-4 border-border-input pl-3'>{parts}</blockquote>
    }
    return <p className='whitespace-pre-wrap'>{parts}</p>
}

function Parts({ parts, drawing }: { parts: Inline[]; drawing: Drawing }) {
    return parts.map((part, index) => (
        <Fragment key={index}>
            <Part part={part} drawing={drawing} />
        </Fragment>
    ))
}

function Part({ part, drawing }: { part: Inline; drawing: Drawing }) {
    switch (part.type) {
        case 'text':
            return part.text
        case 'bold':
            return (
                <strong className='font-semibold'>
                    <Parts parts={part.children} drawing={drawing} />
                </strong>
            )
        case 'italic':
            return (
                <em>
                    <Parts parts={part.children} drawing={drawing} />
                </em>
            )
        case 'strike':
            return (
                <s>
                    <Parts parts={part.children} drawing={drawing} />
                </s>
            )
        case 'code':
            return <code className='rounded-badge bg-surface-2 px-1 font-mono text-mono-code'>{part.text}</code>
        case 'link':
            return <LinkPart href={part.href} readLink={drawing.readLink} />
        case 'mention':
        case 'everyone':
            return <MentionChip part={part} mentions={drawing.mentions} />
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
