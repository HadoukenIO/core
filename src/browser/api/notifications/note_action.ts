/*
Copyright 2017 OpenFin Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
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
