//SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract DocumentRegistry {

    struct Document {
        address owner;
        uint64 timestamp;
        string ipfsCID;
        string docType;
        string issuedBy;
        bool revoked;
    }

    mapping(bytes32 => Document) private documents;
    mapping(address => bytes32[]) private ownerDocs;

    event DocumentRegistered(
        bytes32 indexed hash,
        address indexed owner,
        uint256 timestamp,
        string docType
    );

    event DocumentRevoked(
        bytes32 indexed hash,
        address indexed owner
    );

    function registerDocument(
        bytes32 _hash,
        string calldata _cid,
        string calldata _docType,
        string calldata _issuedBy
    ) public {
        require(documents[_hash].timestamp == 0, "Already exists");

        documents[_hash] = Document({
            owner: msg.sender,
            timestamp: uint64(block.timestamp),
            ipfsCID: _cid,
            docType: _docType,
            issuedBy: _issuedBy,
            revoked: false
        });

        ownerDocs[msg.sender].push(_hash);

        emit DocumentRegistered(_hash, msg.sender, block.timestamp, _docType);
    }

    function verifyDocument(bytes32 _hash)
        public view
        returns (
            bool,
            address,
            uint256,
            string memory,
            bool
        )
    {
        Document memory doc = documents[_hash];

        if (doc.timestamp == 0) {
            return (false, address(0), 0, "", false);
        }

        return (
            true,
            doc.owner,
            uint256(doc.timestamp),
            doc.issuedBy,
            doc.revoked
        );
    }

    function revokeDocument(bytes32 _hash) public {
        require(documents[_hash].owner == msg.sender, "Not owner");
        require(!documents[_hash].revoked, "Already revoked");

        documents[_hash].revoked = true;

        emit DocumentRevoked(_hash, msg.sender);
    }

    function getDocumentsByOwner(address _owner)
        public view
        returns (bytes32[] memory)
    {
        return ownerDocs[_owner];
    }
}
