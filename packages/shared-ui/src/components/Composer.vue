<script setup lang="ts">
import { ref } from 'vue'

const props = withDefaults(
  defineProps<{
    disabled?: boolean
    placeholder?: string
    /** Async submit; parent decides transport (bridge / remote / local DSH). */
    onSubmit?: (text: string) => void | Promise<void>
  }>(),
  { placeholder: '输入消息，Enter 发送，Shift+Enter 换行' }
)

const emits = defineEmits<{
  (e: 'submit', text: string): void
  (e: 'drop-files', files: Array<{ name: string; data: string }>): void
}>()

const text = ref('')
const sending = ref(false)

async function send() {
  const value = text.value.trim()
  if (!value || props.disabled || sending.value) return
  sending.value = true
  try {
    await props.onSubmit?.(value)
    emits('submit', value)
    text.value = ''
  } finally {
    sending.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    void send()
  }
}

async function onDrop(event: DragEvent) {
  const items = Array.from(event.dataTransfer?.items ?? []).filter((item) => item.kind === 'file')
  if (items.length === 0) return
  event.preventDefault()
  const files: Array<{ name: string; data: string }> = []
  for (const item of items) {
    const file = item.getAsFile()
    if (!file) continue
    // Read as data URL; large files should go through the native file-drop bridge.
    const dataUrl = await new Promise<string>((resolvePromise, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolvePromise(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })
    files.push({ name: file.name, data: dataUrl })
  }
  emits('drop-files', files)
}
</script>

<template>
  <footer class="dsh-composer">
    <div
      class="dsh-composer__drop"
      @dragover.prevent
      @drop.prevent="onDrop"
    >
      <textarea
        v-model="text"
        class="dsh-textarea dsh-composer__input"
        :placeholder="placeholder"
        :disabled="disabled"
        rows="2"
        @keydown="onKeydown"
      />
      <div class="dsh-composer__actions">
        <button
          class="dsh-button dsh-button--primary"
          :disabled="disabled || text.trim().length === 0 || sending"
          @click="send"
        >
          {{ sending ? '发送中…' : '发送' }}
        </button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.dsh-composer {
  border-top: 1px solid var(--dsh-border);
  padding: var(--dsh-gap-m);
  background: var(--dsh-bg-elevated);
}
.dsh-composer__drop {
  display: flex;
  gap: var(--dsh-gap-s);
  align-items: flex-end;
}
.dsh-composer__input {
  flex: 1;
  resize: none;
}
.dsh-composer__actions {
  display: flex;
  gap: var(--dsh-gap-s);
}
</style>
