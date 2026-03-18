import React from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { KA_RED, PROMPT_CATEGORIES } from '../constants'

interface Props {
  visible: boolean
  onClose: () => void
  onSelect: (prompt: string) => void
}

export function PromptsModal({ visible, onClose, onSelect }: Props) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Suggested Prompts</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <Text style={styles.closeBtnText}>Done</Text>
          </TouchableOpacity>
        </View>

        {/* Categories */}
        <ScrollView contentContainerStyle={styles.content}>
          {PROMPT_CATEGORIES.map((cat) => (
            <View key={cat.name} style={styles.category}>
              <Text style={styles.categoryName}>{cat.name}</Text>
              {cat.prompts.map((p) => (
                <TouchableOpacity
                  key={p}
                  style={styles.promptRow}
                  onPress={() => { onSelect(p); onClose() }}
                >
                  <Text style={styles.promptText}>{p}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
  },
  closeBtnText: {
    fontSize: 16,
    color: KA_RED,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  category: {
    marginTop: 28,
  },
  categoryName: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: '#aaa',
    marginBottom: 8,
  },
  promptRow: {
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f0f0',
  },
  promptText: {
    fontSize: 15,
    color: '#333',
  },
})
