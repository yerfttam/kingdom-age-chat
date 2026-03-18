import React, { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from 'react-native'
import Markdown from 'react-native-markdown-display'
import * as Clipboard from 'expo-clipboard'
import * as Haptics from 'expo-haptics'
import { KA_RED } from '../constants'
import type { ChatMessage as ChatMessageType } from '../hooks/useChat'

interface Props {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  const [copied, setCopied] = useState(false)
  const [showSources, setShowSources] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await Clipboard.setStringAsync(message.text)
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <Text style={[styles.label, isUser ? styles.labelUser : styles.labelAssistant]}>
        {isUser ? 'You' : 'Kingdom Age'}
      </Text>

      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
        {isUser ? (
          <Text style={styles.userText}>{message.text}</Text>
        ) : (
          <Markdown style={markdownStyles}>{message.text}</Markdown>
        )}
      </View>

      {!isUser && message.text.length > 0 && (
        <View style={styles.actions}>
          <TouchableOpacity onPress={handleCopy} style={styles.copyBtn}>
            <Text style={styles.copyBtnText}>{copied ? '✓ Copied' : 'Copy'}</Text>
          </TouchableOpacity>

          {message.sources && message.sources.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowSources((s) => !s)}
              style={styles.sourcesToggle}
            >
              <Text style={styles.sourcesToggleText}>
                {message.sources.length} source{message.sources.length !== 1 ? 's' : ''}{' '}
                {showSources ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {showSources && message.sources && (
        <View style={styles.sourcesList}>
          {message.sources.map((s, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => Linking.openURL(s.url)}
              style={styles.sourceItem}
            >
              <Text style={styles.sourceText} numberOfLines={1}>
                {s.title}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'column',
    gap: 4,
    paddingHorizontal: 16,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  labelUser: {
    color: '#c0392b',
  },
  labelAssistant: {
    color: '#999',
  },
  bubble: {
    maxWidth: '88%',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: KA_RED,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: '#f2f2f2',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
    paddingLeft: 4,
  },
  copyBtn: {
    paddingVertical: 2,
  },
  copyBtnText: {
    fontSize: 11,
    color: '#bbb',
  },
  sourcesToggle: {
    paddingVertical: 2,
  },
  sourcesToggleText: {
    fontSize: 11,
    color: KA_RED,
  },
  sourcesList: {
    marginTop: 4,
    paddingLeft: 4,
    gap: 2,
    maxWidth: '88%',
  },
  sourceItem: {
    paddingVertical: 2,
  },
  sourceText: {
    fontSize: 11,
    color: '#aaa',
  },
})

const markdownStyles = {
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: '#1a1a1a',
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 8,
  },
  strong: {
    fontWeight: '700' as const,
  },
  bullet_list: {
    marginBottom: 8,
  },
  ordered_list: {
    marginBottom: 8,
  },
  list_item: {
    marginBottom: 4,
  },
  heading1: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 8,
    color: '#1a1a1a',
  },
  heading2: {
    fontSize: 16,
    fontWeight: '700' as const,
    marginBottom: 6,
    color: '#1a1a1a',
  },
  heading3: {
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 4,
    color: '#1a1a1a',
  },
}
