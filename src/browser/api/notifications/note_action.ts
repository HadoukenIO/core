enum NoteAction {
    dummmy,
    // root topic
    noteMessage,

    // this is inbound from the external connection
    create_external,

    // this is sent to the proxy notifications app on behalf of the remote connection
    proxied_create_call,

    // seqs. ...
    created_notes,
    request_note_close,

    drag,
    mouseover,
    mouseenter,
    mouseleave,
    mouseout,
    mousemove,
    create,
    animating,
    message_from_note,
    qQuery,
    qQueryResponse,
    qQueryUpdate,

    // userland topics
    click,
    close,
    dismiss,
    error,
    message,
    show
}

export default NoteAction;
