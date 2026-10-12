<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import CodeEditor from "./components/CodeEditor.vue";
import FileTree from "./components/FileTree.vue";
import PreviewPane from "./components/PreviewPane.vue";
import Problems from "./components/Problems.vue";
import { useStudio } from "./store";

const studio = useStudio();
const editorRef = ref<InstanceType<typeof CodeEditor>>();
const newName = ref("");
const newTemplate = ref("blank");
const showPreview = ref(true);
const rendererChoice = ref("auto");

function changeRenderer(): void {
  void studio.setRenderer(rendererChoice.value === "auto" ? "" : rendererChoice.value);
}

onMounted(() => studio.init());

const statusLabel = computed(() => {
  if (studio.status === "error") return "error";
  if (studio.status === "ready") return studio.hasErrors ? "build failed" : "up to date";
  return studio.status;
});

async function createProject(): Promise<void> {
  const name = newName.value.trim();
  if (!name) return;
  await studio.createProject(name, newTemplate.value);
  newName.value = "";
}

async function newFile(): Promise<void> {
  const path = window.prompt("New file path (e.g. slides/intro.rtex)");
  if (path) await studio.createFile(path);
}

async function openDiagnostic(payload: { file: string; line: number }): Promise<void> {
  await studio.openFile(payload.file);
  await nextTick();
  editorRef.value?.goTo(payload.line);
}

function onUpload(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) void studio.uploadFiles(input.files);
}
</script>

<template>
  <div class="app">
    <header class="topbar">
      <span class="title">RevealTeX Studio</span>
      <select v-model="studio.activeId" @change="studio.selectProject(studio.activeId)" :disabled="!studio.projects.length">
        <option value="" disabled>Select a project</option>
        <option v-for="project in studio.projects" :key="project.id" :value="project.id">{{ project.name }}</option>
      </select>
      <input v-model="newName" placeholder="New project name" style="width: 160px" @keyup.enter="createProject" />
      <select v-model="newTemplate">
        <option v-for="template in studio.templates" :key="template.name" :value="template.name">{{ template.label }}</option>
      </select>
      <button class="primary" @click="createProject">New</button>
      <span class="spacer" />
      <label class="badge">Renderer
        <select v-model="rendererChoice" @change="changeRenderer" style="margin-left: 6px">
          <option value="auto">auto</option>
          <option value="vue">vue</option>
          <option value="html">html</option>
        </select>
      </label>
      <button @click="showPreview = !showPreview">{{ showPreview ? "Hide preview" : "Show preview" }}</button>
      <span class="badge" :class="studio.hasErrors ? 'bad' : 'ok'">{{ statusLabel }}</span>
    </header>

    <div class="workspace" :class="{ 'no-preview': !showPreview }">
      <aside class="sidebar">
        <h3>Projects</h3>
        <div class="projects">
          <button
            v-for="project in studio.projects"
            :key="project.id"
            :class="{ active: project.id === studio.activeId }"
            @click="studio.selectProject(project.id)"
          >
            {{ project.name }}
            <span style="float: right; opacity: .6" @click.stop="studio.deleteProject(project.id)">×</span>
          </button>
          <p v-if="!studio.projects.length" style="padding: 0 8px; color: #64748b;">No projects yet.</p>
        </div>
        <div class="actions">
          <button @click="newFile" :disabled="!studio.activeId">New file</button>
          <label class="badge" style="cursor: pointer; display: inline-flex; align-items: center;">
            Upload
            <input type="file" multiple style="display: none" @change="onUpload" />
          </label>
        </div>
        <h3>Files</h3>
        <FileTree :tree="studio.tree" :active="studio.activePath" @open="studio.openFile" />
      </aside>

      <section class="editor">
        <div class="tabs">
          <div
            v-for="file in studio.openFiles"
            :key="file.path"
            class="tab"
            :class="{ active: file.path === studio.activePath }"
            @click="studio.activePath = file.path"
          >
            <span v-if="file.dirty" class="dot" />
            <span>{{ file.path.split('/').pop() }}</span>
            <span style="opacity: .5" @click.stop="studio.closeFile(file.path)">×</span>
          </div>
        </div>
        <CodeEditor ref="editorRef" :file="studio.activeFile" @update="studio.updateContent" @save="studio.saveActive" />
        <Problems :diagnostics="studio.diagnostics" @open="openDiagnostic" />
        <div class="statusbar">
          <span>{{ studio.activeFile?.path ?? "—" }}</span>
          <span>{{ studio.activeFile?.dirty ? "unsaved" : "saved" }}</span>
          <span>{{ studio.diagnostics.length }} problem(s)</span>
        </div>
      </section>

      <PreviewPane v-if="showPreview" :url="studio.previewUrl" :kind="studio.previewKind" :revision="studio.revision" />
    </div>

    <div v-if="studio.error" class="error-toast" @click="studio.clearError()">{{ studio.error }} (click to dismiss)</div>
  </div>
</template>
