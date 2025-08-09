const Config: PluginConfig = {
  addonType: "plugin",
  type: "object",
  id: "MasterPose_FpsManager",
  name: "FPS Manager",
  version: "1.0.0.0",
  category: "media",
  author: "Master Pose",
  description: "Set a hard limit on the maximum FPS of your game. Originialy made by Skymen.",
  icon: "icon.svg",
  editorScripts: ['editor.js'],
  website: "https://masterpose.itch.io/fps-manager-c3",
  documentation: "https://masterpose.itch.io/fps-manager-c3",
  addonUrl: 'https://masterpose.itch.io/fps-manager-c3',
  githubUrl: "https://github.com/MasterPose/c3-fps-manager",
  interface: {
    instanceName: 'IFpsManager'
  },
  info: {
    Set: {
      CanBeBundled: true,
      IsDeprecated: false,
      IsSingleGlobal: true,
    },
  },
  fileDependencies: {},
  properties: [
    {
      id: 'max_framerate',
      desc: 'Sets the maximum framerate your game can run on. (Set 0 to disable).',
      name: 'Max Framerate',
      type: 'integer',
      options: {
        initialValue: 0,
      }
    }
  ],
  aceCategories: {
    general: "General",
    framerate: "Framerate",
  },
};

export default Config as BuiltAddonConfig;
