/// Page state enum.
enum PageState {
  /// Show nothing before loading.
  /// Avoid screen flickering.
  preLoading,

  /// Show loading state.
  loading,

  /// Indicate that we're fetching more data.
  loadingMore,

  /// Page has finished doing all work.
  idle,

  /// Deleting one or more messages.
  deletingMessage,

  /// Archiving one or more messages.
  archivingMessage,
}
