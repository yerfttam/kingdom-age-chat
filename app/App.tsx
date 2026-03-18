import React, { useState, useRef, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  ActionSheetIOS,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { useChat } from './hooks/useChat'
import { ChatMessage } from './components/ChatMessage'
import { PromptsModal } from './components/PromptsModal'
import { KA_RED, MODELS, ALL_PROMPTS } from './constants'

export default function App() {
  const [model, setModel] = useState('claude-opus-4-6')
  const [input, setInput] = useState('')
  const [showPrompts, setShowPrompts] = useState(false)
  const scrollRef = useRef<ScrollView>(null)
  const inputRef = useRef<TextInput>(null)

  const getModel = useCallback(() => model, [model])
  const { messages, status, sendMessage } = useChat(getModel)

  const busy = status === 'submitted' || status === 'streaming'

  /* 6 random suggested prompts shown on welcome screen */
  const featuredPrompts = useMemo(() => {
    return [...ALL_PROMPTS].sort(() => Math.random() - 0.5).slice(0, 6)
  }, [])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    sendMessage(text)
  }

  const handlePrompt = (text: string) => {
    if (busy) return
    sendMessage(text)
  }

  const handleModelPicker = () => {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Select Model',
        options: [...MODELS.map((m) => m.label), 'Cancel'],
        cancelButtonIndex: MODELS.length,
      },
      (index) => {
        if (index < MODELS.length) setModel(MODELS[index].value)
      }
    )
  }

  const currentModelLabel = MODELS.find((m) => m.value === model)?.label ?? model

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={KA_RED} />

      {/* ── Header ── */}
      <SafeAreaView style={styles.headerSafe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            Kingdom Age <Text style={styles.headerTitleAccent}>Chat</Text>
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Body ── */}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          onContentSizeChange={() =>
            scrollRef.current?.scrollToEnd({ animated: true })
          }
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            /* Welcome screen */
            <View style={styles.welcome}>
              <Text style={styles.welcomeHeading}>Ask Anything</Text>
              <Text style={styles.welcomeSub}>
                Answers sourced from Kingdom Age teachings
              </Text>
              <View style={styles.featuredPrompts}>
                {featuredPrompts.map((p) => (
                  <TouchableOpacity
                    key={p}
                    style={styles.promptChip}
                    onPress={() => handlePrompt(p)}
                  >
                    <Text style={styles.promptChipText}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setShowPrompts(true)}>
                <Text style={styles.seeAllPrompts}>See all suggested prompts →</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.messageList}>
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
              {status === 'submitted' && (
                <View style={styles.thinkingRow}>
                  <Text style={styles.thinkingLabel}>Kingdom Age</Text>
                  <View style={styles.thinkingBubble}>
                    <ActivityIndicator size="small" color="#aaa" />
                    <Text style={styles.thinkingText}>Searching…</Text>
                  </View>
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Input bar */}
        <View style={styles.inputBar}>
          <View style={styles.inputCard}>
            <TextInput
              ref={inputRef}
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask a question…"
              placeholderTextColor="#bbb"
              multiline
              maxLength={2000}
              editable={!busy}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || busy) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || busy}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Toolbar */}
        <SafeAreaView style={styles.toolbarSafe} edges={['bottom']}>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={() => setShowPrompts(true)}>
              <Text style={styles.toolbarBtn}>Suggested Prompts</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleModelPicker} style={styles.modelBtn}>
              <Text style={styles.modelBtnText} numberOfLines={1}>
                {currentModelLabel}
              </Text>
              <Text style={styles.modelBtnChevron}>▾</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>

      {/* Prompts modal */}
      <PromptsModal
        visible={showPrompts}
        onClose={() => setShowPrompts(false)}
        onSelect={handlePrompt}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: KA_RED,
  },
  headerSafe: {
    backgroundColor: KA_RED,
  },
  header: {
    backgroundColor: KA_RED,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  headerTitleAccent: {
    color: 'rgba(255,255,255,0.75)',
    fontWeight: '400',
  },
  body: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingVertical: 20,
  },
  messageList: {
    gap: 20,
  },
  /* Welcome */
  welcome: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 12,
  },
  welcomeHeading: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  welcomeSub: {
    fontSize: 13,
    color: '#aaa',
    textAlign: 'center',
  },
  featuredPrompts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  promptChip: {
    backgroundColor: '#f7f7f7',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  promptChipText: {
    fontSize: 13,
    color: '#555',
  },
  seeAllPrompts: {
    fontSize: 13,
    color: '#bbb',
    marginTop: 4,
  },
  /* Thinking indicator */
  thinkingRow: {
    paddingHorizontal: 16,
    gap: 4,
  },
  thinkingLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#999',
    letterSpacing: 0.3,
  },
  thinkingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f2f2f2',
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignSelf: 'flex-start',
  },
  thinkingText: {
    fontSize: 14,
    color: '#aaa',
    fontStyle: 'italic',
  },
  /* Input */
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8e8e8',
  },
  inputCard: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#f7f7f7',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#e8e8e8',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#1a1a1a',
    maxHeight: 120,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sendBtn: {
    backgroundColor: KA_RED,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendBtnDisabled: {
    opacity: 0.35,
  },
  sendBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  /* Toolbar */
  toolbarSafe: {
    backgroundColor: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    backgroundColor: '#fff',
  },
  toolbarBtn: {
    fontSize: 12,
    color: '#aaa',
  },
  modelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modelBtnText: {
    fontSize: 12,
    color: '#aaa',
    maxWidth: 180,
  },
  modelBtnChevron: {
    fontSize: 10,
    color: '#bbb',
  },
})
